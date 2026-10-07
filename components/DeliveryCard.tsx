import React, { useState } from "react";
import { Delivery, DeliveryStatus } from "../types";
import {
  MapPin,
  FileText,
  Camera as CameraIcon,
  CheckCircle,
  AlertTriangle,
  XCircle,
  BrainCircuit,
  Lock,
  Image,
  X,
  Clock,
} from "lucide-react";
// 🚨 IMPORTANDO CAPACITOR CAMERA
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { getDeliveryAssistantTip } from "../services/geminiService";
// 🚨 NOVO IMPORT SUPABASE
import { uploadImageToSupabase } from "../src/services/supabaseService";
import { getApiUrl } from "../src/apiConfig";
import { isOnline } from "../src/services/networkService";

// ... (código anterior mantido)

// ... (código anterior mantido)

// Interface movida para o topo (boa prática) ou mantida se já existir
interface DeliveryCardProps {
  delivery: Delivery;
  onStatusChange: (id: string, newStatus: DeliveryStatus) => void;
  onArrival: (id: string) => void;
  jornadaIniciada: boolean;
}

export const DeliveryCard: React.FC<DeliveryCardProps> = ({
  delivery,
  onStatusChange,
  onArrival,
  jornadaIniciada,
}) => {
  const [aiTip, setAiTip] = useState<string | null>(null);
  const [loadingTip, setLoadingTip] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  // Estados para Modal de Decisão (Total vs Parcial)
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [isPartialDelivery, setIsPartialDelivery] = useState(false);
  const [isRegisteringArrival, setIsRegisteringArrival] = useState(false);
  const [showArrivalModal, setShowArrivalModal] = useState(false);

  // 🚨 NOVA FUNÇÃO: Atualizar o status no Backend (PUT /atualizar_status)
  const updateStatusOnBackend = async (
    numSeq: string,
    status: DeliveryStatus,
    fotoUrl: string,
    isPartial: boolean
  ) => {
    // URL completa é resolvida pelo proxy do Vite
    const apiUrl = getApiUrl(`api/atualizar_status/${numSeq}`);
    // Captura o horário UTC exato
    const capturedAtUtc = new Date().toISOString();

    const payload = {
      status:
        status === DeliveryStatus.COMPLETED ? "CONCLUIDA" : "NAO_ENTREGUE",
      fotoUrl: fotoUrl,
      capturedAtUtc: capturedAtUtc,
      isPartial: isPartial,
    };

    try {
      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Falha ao sincronizar: ${response.status}`);
      }

      console.log(`Entrega ${numSeq} atualizada no backend com sucesso.`);
      return true;
    } catch (error: any) {
      console.error("Erro ao enviar status para o backend:", error.message);
      return false; // Não exibe alerta — o chamador decide como tratar
    }
  };

  const handleRegisterArrival = async () => {
    setIsRegisteringArrival(true);

    // Modo offline: salva na fila do localStorage
    if (!isOnline()) {
      const pending = JSON.parse(localStorage.getItem('offline_pending_arrivals') || '[]');
      pending.push({ numSeq: delivery.id, timestamp: new Date().toISOString() });
      localStorage.setItem('offline_pending_arrivals', JSON.stringify(pending));
      onArrival(delivery.id);
      setIsRegisteringArrival(false);
      return;
    }

    const apiUrl = getApiUrl(`api/registrar_chegada/${delivery.id}`);
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Falha ao registrar chegada");
      }

      onArrival(delivery.id);
    } catch (error: any) {
      console.error("Erro ao registrar chegada:", error.message);
      // Se falhou por falta de rede, salva na fila e não exibe erro para o motorista
      if (error.message?.includes('fetch') || !isOnline()) {
        const pending = JSON.parse(localStorage.getItem('offline_pending_arrivals') || '[]');
        pending.push({ numSeq: delivery.id, timestamp: new Date().toISOString() });
        localStorage.setItem('offline_pending_arrivals', JSON.stringify(pending));
        onArrival(delivery.id);
      } else {
        alert(`Erro: ${error.message}`);
      }
    } finally {
      setIsRegisteringArrival(false);
    }
  };

  const getStatusColor = (status: DeliveryStatus) => {
    switch (status) {
      case DeliveryStatus.COMPLETED:
        return "text-green-700 bg-green-50 border-green-200";
      case DeliveryStatus.FAILED:
        return "text-red-700 bg-red-50 border-red-200";
      case DeliveryStatus.IN_PROGRESS:
        return "text-blue-700 bg-blue-50 border-blue-200";
      default:
        return "text-amber-700 bg-amber-50 border-amber-200";
    }
  };

  const getStatusIcon = (status: DeliveryStatus) => {
    switch (status) {
      case DeliveryStatus.COMPLETED:
        return <CheckCircle size={16} />;
      case DeliveryStatus.FAILED:
        return <XCircle size={16} />;
      default:
        return <AlertTriangle size={16} />;
    }
  };

  const handleAiAssist = async () => {
    if (aiTip) {
      setAiTip(null); // Toggle off
      return;
    }
    setLoadingTip(true);
    const tip = await getDeliveryAssistantTip(delivery);
    setAiTip(tip);
    setLoadingTip(false);
  };

  // Botão INICIAL: Abre o modal de pergunta (Total vs Parcial)
  const handlePhotoActionClick = (e: React.MouseEvent) => {
    e.preventDefault(); // Previne ação padrão

    if (!jornadaIniciada) {
      alert(
        "⚠️ Você precisa INICIAR A JORNADA no menu de opções (topo da tela) para realizar entregas."
      );
      return;
    }
    // Abre o modal de decisão
    setShowStatusModal(true);
  };

  // Seleção no Modal: Chama a câmera nativa
  const handleSelectType = (partial: boolean) => {
    setIsPartialDelivery(partial);
    setShowStatusModal(false);
    takePicture(partial); // Chama função de câmera direta
  };

  // 🚨 FUNÇÃO PARA CAPTURAR FOTO VIA CAPACITOR (Melhorada para evitar tela preta)
  const takePicture = async (isPartial: boolean) => {
    if (!jornadaIniciada || isUploading) return;

    try {
      // Solicita permissões apenas no app nativo (no browser, webUseInput abre file picker sem precisar)
      if (Capacitor.isNativePlatform()) {
        const permissions = await Camera.requestPermissions();
        if (permissions.camera !== 'granted') {
          alert("Atenção: Você precisa permitir o acesso à câmera para enviar o comprovante.");
          return;
        }
      }

      // Captura a foto
      const image = await Camera.getPhoto({
        quality: 60, // Aumentado levemente para melhor legibilidade
        width: 1200, // Largura máxima otimizada
        allowEditing: false,
        resultType: CameraResultType.Uri,
        // Ao usar Prompt, o Android abre um seletor nativo que é muito mais estável que forçar a câmera
        source: CameraSource.Camera, 
        saveToGallery: false,
        webUseInput: true, // 👈 Importante para funcionar estável no navegador/PWA
      });

      if (image.webPath) {
        // Converte blob/url para File object para reusar lógica
        const response = await fetch(image.webPath);
        const blob = await response.blob();
        const file = new File([blob], `photo_${delivery.id}.jpg`, {
          type: "image/jpeg",
        });

        // Chama o upload
        await processPhotoUpload(file, isPartial);
      }
    } catch (error: any) {
      // Mensagens possíveis de cancelamento em diferentes versões do Android/iOS
      const cancelMsgs = ['user cancelled', 'no image picked', 'cancelled photos app', 'cancel'];
      const msg = (error?.message || '').toLowerCase();
      const isCancelled = !error || !error.message || cancelMsgs.some(c => msg.includes(c));
      if (!isCancelled) {
        console.error("Erro na Câmera:", error);
        alert("Não foi possível abrir a câmera. Tente novamente ou verifique as permissões do app.");
      }
    }
  };

  // 🚨 LÓGICA DE UPLOAD CENTRALIZADA (Extraída do antigo onChange)
  const processPhotoUpload = async (imageFile: File, isPartial: boolean) => {
    setIsUploading(true);

    const numSeq = delivery.id;
    const newStatus = DeliveryStatus.COMPLETED;
    const capturedAtUtc = new Date().toISOString();

    try {
      if (!isOnline()) {
        // --- MODO OFFLINE ---
        const { savePendingUpload } = await import(
          "../src/services/offlineStorage"
        );
        await savePendingUpload(
          numSeq,
          imageFile,
          newStatus,
          capturedAtUtc,
          isPartial
        );
        alert(
          "Sem internet! 📶\nA foto foi salva e será enviada automaticamente quando a conexão voltar."
        );
        onStatusChange(numSeq, newStatus);
      } else {
        // --- MODO ONLINE ---
        let imageUrl: string | null = null;
        try {
          imageUrl = await uploadImageToSupabase(imageFile);
          if (!imageUrl) throw new Error('Upload retornou null');
        } catch (uploadError: any) {
          // Upload falhou (rede instável, Supabase offline etc.) → cai no modo offline automaticamente
          console.warn('Upload falhou, salvando offline:', uploadError.message);
          const { savePendingUpload } = await import('../src/services/offlineStorage');
          await savePendingUpload(numSeq, imageFile, newStatus, capturedAtUtc, isPartial);
          alert("Sem internet! 📶\nA foto foi salva e será enviada automaticamente quando a conexão voltar.");
          onStatusChange(numSeq, newStatus);
          setIsUploading(false);
          return;
        }
        const success = await updateStatusOnBackend(
          numSeq,
          newStatus,
          imageUrl!,
          isPartial
        );
        if (success) {
          onStatusChange(numSeq, newStatus);
        } else {
          // Foto já está no Supabase mas o banco falhou — salva na fila com a URL obtida
          // O sync vai gravar no banco quando a conexão estabilizar, sem re-fazer upload
          const { savePendingUploadWithUrl } = await import('../src/services/offlineStorage');
          await savePendingUploadWithUrl(numSeq, imageUrl!, newStatus, capturedAtUtc, isPartial);
          onStatusChange(numSeq, newStatus); // atualiza UI otimisticamente
          console.warn(`Backend indisponível para ${numSeq}. Agendado para sync automático.`);
        }
      }
    } catch (err) {
      console.error("Erro no upload:", err);
      alert("Ocorreu um erro ao processar a imagem.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4 relative overflow-hidden">
      {/* --- MODAL DE DECISÃO (OVERLAY) --- */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl transform scale-100 transition-all">
            <h3 className="text-xl font-bold text-slate-800 mb-4 text-center">
              Tipo de Entrega
            </h3>
            <p className="text-slate-500 text-center mb-6 text-sm">
              A entrega para{" "}
              <strong>{delivery.customerName.split(" ")[0]}</strong> foi
              realizada totalmente ou houve devolução de itens?
            </p>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => handleSelectType(false)} // Total
                className="bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30 transition-all active:scale-95"
              >
                <CheckCircle size={20} />
                Entrega Total (100%)
              </button>

              <button
                onClick={() => handleSelectType(true)} // Parcial
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 transition-all active:scale-95"
              >
                <AlertTriangle size={20} />
                Entrega Parcial / Devolução
              </button>

              <button
                onClick={() => setShowStatusModal(false)}
                className="mt-2 text-slate-400 font-medium py-2 text-sm hover:text-slate-600 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Visualização da Foto */}
      {showPhotoModal && delivery.imageUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowPhotoModal(false)}
        >
          <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowPhotoModal(false)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white p-2"
            >
              <X size={28} />
            </button>
            <p className="text-white/60 text-xs text-center mb-3 font-semibold uppercase tracking-wider">
              Comprovante — {delivery.customerName}
            </p>
            <img
              src={delivery.imageUrl}
              alt="Comprovante de entrega"
              className="w-full rounded-2xl shadow-2xl border-2 border-white/10"
            />
          </div>
        </div>
      )}

      {/* --- MODAL DE CONFIRMAÇÃO DE CHEGADA --- */}
      {showArrivalModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in text-center">
          <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl transform scale-100 transition-all border border-slate-100">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mb-6 mx-auto">
              <Clock className="text-amber-600" size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-3">
              Confirmar Chegada?
            </h3>
            <p className="text-slate-500 mb-8 text-base">
              Você deseja registrar o horário de chegada <br/> no cliente <br/>
              <span className="font-bold text-slate-700">{delivery.customerName}</span>?
            </p>

            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => {
                  setShowArrivalModal(false);
                  handleRegisterArrival();
                }}
                className="bg-brand-600 hover:bg-brand-700 text-white font-black py-4 px-6 rounded-2xl shadow-xl shadow-brand-500/20 transition-all active:scale-95 text-lg"
              >
                Confirmar Registro
              </button>
              <button
                onClick={() => setShowArrivalModal(false)}
                className="text-slate-400 font-bold py-2 hover:text-slate-600 transition-colors"
              >
                Agora não
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cabeçalho com Status */}
      <div className="flex justify-between items-start mb-3">
        <div
          className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border ${getStatusColor(
            delivery.status
          )}`}
        >
          {getStatusIcon(delivery.status)}
          <span>
            {delivery.status === DeliveryStatus.PENDING
              ? "PENDENTE"
              : delivery.status === DeliveryStatus.COMPLETED
                ? "FINALIZADO"
                : delivery.status === DeliveryStatus.FAILED
                  ? "FALHA"
                  : "EM ROTA"}
          </span>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400 font-mono">
            Nota: {delivery.billId}
          </div>
          {delivery.bilhete && (
            <div className="text-xs text-slate-400 font-mono">
              Bilhete: {delivery.bilhete}
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1">
        {delivery.customerName}
      </h3>

      <div className="flex items-start gap-2 text-slate-500 text-sm mb-2">
        <MapPin size={16} className="mt-0.5 shrink-0 text-brand-500" />
        <div>
          <p>{delivery.address}</p>
          <p className="text-xs text-slate-400 font-medium uppercase">
            {delivery.district}
          </p>
        </div>
      </div>

      {delivery.note && (
        <div className="flex items-center gap-2 text-slate-600 text-xs bg-slate-50 p-2 rounded-lg mb-3 border border-slate-100">
          <FileText size={14} className="shrink-0 text-slate-400" />
          <span className="italic">"{delivery.note}"</span>
        </div>
      )}

      {/* Seção IA */}
      {aiTip && (
        <div className="mb-3 p-3 bg-gradient-to-r from-brand-50 to-emerald-50 rounded-lg border border-brand-100 text-brand-800 text-sm animate-fade-in">
          <div className="flex items-center gap-2 mb-1 font-bold text-xs uppercase tracking-wider">
            <BrainCircuit size={12} /> Dica Inteligente
          </div>
          {aiTip}
        </div>
      )}

      {/* Ações */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 gap-2">

        {delivery.status === DeliveryStatus.PENDING && (
          <div className="flex-1 flex justify-start">
            {!delivery.arrivalTime ? (
            <button
                onClick={() => {
                  if (!jornadaIniciada) {
                    alert("⚠️ Inicie a jornada primeiro!");
                    return;
                  }
                  setShowArrivalModal(true);
                }}
                disabled={isRegisteringArrival || !jornadaIniciada}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95
                  ${jornadaIniciada && !isRegisteringArrival
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
              >
                {isRegisteringArrival ? (
                  <div className="animate-spin h-3.5 w-3.5 border-2 border-amber-700 border-t-transparent rounded-full"></div>
                ) : (
                  <Clock size={14} />
                )}
                <span>Registrar Chegada</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-xl text-xs font-bold border border-green-100">
                <Clock size={14} />
                <span>Chegada registrada</span>
              </div>
            )}
          </div>
        )}

        {delivery.status === DeliveryStatus.PENDING && (
          <div className="flex-1 flex justify-end">
            <button
              onClick={handlePhotoActionClick}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold shadow-md transition-transform active:scale-95 cursor-pointer 
               ${jornadaIniciada && !isUploading
                  ? "bg-brand-600 text-white shadow-brand-500/30 hover:bg-brand-700"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                }`}
            >
              {isUploading ? (
                <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></div>
              ) : jornadaIniciada ? (
                <CameraIcon size={14} />
              ) : (
                <Lock size={14} />
              )}
              <span>{isUploading ? "Enviando..." : "Foto Comprovante"}</span>
            </button>
          </div>
        )}

        {delivery.status === DeliveryStatus.COMPLETED && (
          <div className="flex items-center gap-2">
            <div className="text-xs text-brand-700 bg-brand-50 px-3 py-1.5 rounded-full font-semibold flex items-center gap-1 border border-brand-100">
              <CheckCircle size={14} /> Comprovante Enviado
            </div>
            {delivery.imageUrl && (
              <button
                onClick={() => setShowPhotoModal(true)}
                title="Ver foto do comprovante"
                className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors active:scale-90"
              >
                <Image size={16} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
