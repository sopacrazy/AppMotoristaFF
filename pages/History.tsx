import React, { useState, useEffect } from 'react';
import { Search, Package, MapPin, Calendar, AlertCircle, Camera as CameraIcon, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Delivery, DeliveryStatus } from '../types';
import { mapDeliveriesArray } from '../src/services/deliveryMapper';
import { getApiUrl } from '../src/apiConfig';
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { uploadImageToSupabase } from "../src/services/supabaseService";

interface HistoryProps {
  codMotorista: string | null;
  isAdmin?: boolean;
}

export const History: React.FC<HistoryProps> = ({ codMotorista, isAdmin }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingDeliveries, setPendingDeliveries] = useState<(Delivery & { deliveryDate?: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState<string | null>(null);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;

  // Filtros de data
  // Filtros de data
  const [showDateFilter, setShowDateFilter] = useState(false);
  // Inicializa como null para não carregar nada automaticamente
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all' | 'custom' | null>(null);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Buscar entregas pendentes
  const fetchPendingDeliveries = async (page: number = 1) => {
    // Se nenhum filtro foi selecionado, não busca nada (mantém lista vazia)
    if (!codMotorista || dateFilter === null) return;

    setLoading(true);
    try {
      let url = getApiUrl(`api/entregas-pendentes/${codMotorista}`);
      const params = new URLSearchParams();

      // Parâmetros de paginação
      params.append('page', page.toString());
      params.append('limit', itemsPerPage.toString());

      // Aplicar filtro de data
      const today = new Date();
      const formatDate = (date: Date) => date.toISOString().split('T')[0];

      switch (dateFilter) {
        case 'today':
          params.append('data', formatDate(today));
          break;
        case 'week':
          const weekAgo = new Date(today);
          weekAgo.setDate(today.getDate() - 7);
          params.append('dataInicio', formatDate(weekAgo));
          params.append('dataFim', formatDate(today));
          break;
        case 'month':
          const monthAgo = new Date(today);
          monthAgo.setMonth(today.getMonth() - 1);
          params.append('dataInicio', formatDate(monthAgo));
          params.append('dataFim', formatDate(today));
          break;
        case 'custom':
          if (customStartDate && customEndDate) {
            params.append('dataInicio', customStartDate);
            params.append('dataFim', customEndDate);
          }
          break;
        case 'all':
        default:
          // Não adiciona filtro de data - busca todas as pendentes
          break;
      }

      if (params.toString()) {
        url += '?' + params.toString();
      }

      const response = await fetch(url);

      // Verificar se a resposta é JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error('Resposta não é JSON:', text.substring(0, 200));
        throw new Error(`Resposta não é JSON. Status: ${response.status}`);
      }

      if (response.ok) {
        const result = await response.json();

        // Nova estrutura: { data: [...], pagination: {...} }
        const data = result.data || result; // Compatibilidade com resposta antiga
        const pagination = result.pagination || { page: 1, totalPages: 1, total: data.length };

        // Mapear entregas e adicionar data diretamente
        const mapped = data.map((item: any) => {
          const delivery = mapDeliveriesArray([item])[0];
          return {
            ...delivery,
            deliveryDate: item.ZB_DTENTRE || undefined
          };
        });
        // Filtrar apenas pendentes
        const pendentes = mapped.filter(d =>
          d.status === DeliveryStatus.PENDING ||
          !d.status ||
          d.status === DeliveryStatus.IN_PROGRESS
        );

        setPendingDeliveries(pendentes);
        setCurrentPage(pagination.page || page);
        setTotalPages(pagination.totalPages || 1);
        setTotalItems(pagination.total || 0);
      } else {
        console.error('Erro ao buscar entregas pendentes');
        setPendingDeliveries([]);
        setTotalPages(1);
        setTotalItems(0);
      }
    } catch (error) {
      console.error('Erro ao buscar entregas pendentes:', error);
      setPendingDeliveries([]);
      setTotalPages(1);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchGlobalSearch = async (val: string) => {
    if (val.length < 3) return;
    setLoading(true);
    try {
      const url = getApiUrl(`api/pesquisar-bilhete?q=${encodeURIComponent(val)}`);
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const mapped = data.map((item: any) => {
          const delivery = mapDeliveriesArray([item])[0];
          return {
            ...delivery,
            deliveryDate: item.ZB_DTENTRE || undefined,
            nomMot: item.ZH_NOMMOT // Para mostrar quem era o motorista original se for admin
          };
        });
        setPendingDeliveries(mapped);
        setTotalPages(1);
        setTotalItems(mapped.length);
      }
    } catch (error) {
      console.error('Erro na pesquisa global:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Se for admin e tiver termo de busca, faz pesquisa global
    if (isAdmin && searchTerm.length >= 3) {
      const delayDebounceFn = setTimeout(() => {
        fetchGlobalSearch(searchTerm);
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    }

    // Comportamento normal para motorista ou admin sem busca global ativa
    if (codMotorista && dateFilter !== null) {
      setCurrentPage(1);
      fetchPendingDeliveries(1);
    } else if (isAdmin && (!searchTerm || searchTerm.length < 3)) {
        // Se admin mas sem busca, talvez mostrar algo ou nada
        setPendingDeliveries([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codMotorista, dateFilter, customStartDate, customEndDate, searchTerm, isAdmin]);

  // Buscar página específica quando mudar manualmente
  const handlePageNavigation = (page: number) => {
    setCurrentPage(page);
    fetchPendingDeliveries(page); // fetchPendingDeliveries tem guarda para dateFilter === null
  };

  // Função para atualizar status no backend
  const updateStatusOnBackend = async (
    numSeq: string,
    status: DeliveryStatus,
    fotoUrl: string,
    isPartial: boolean = false
  ) => {
    const apiUrl = getApiUrl(`api/atualizar_status/${numSeq}`);
    const capturedAtUtc = new Date().toISOString();

    const payload = {
      status: status === DeliveryStatus.COMPLETED ? "CONCLUIDA" : "NAO_ENTREGUE",
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
        const errorData = await response.json();
        throw new Error(errorData.error || `Falha ao sincronizar: ${response.status}`);
      }

      console.log(`Entrega ${numSeq} atualizada no backend com sucesso.`);
      return true;
    } catch (error: any) {
      console.error("Erro ao enviar status para o backend:", error.message);
      alert(`Erro de sincronização: ${error.message}.`);
      return false;
    }
  };

  // Função para processar upload de foto
  const processPhotoUpload = async (delivery: Delivery, isPartial: boolean) => {
    setIsUploading(delivery.id);

    const numSeq = delivery.id;
    const newStatus = DeliveryStatus.COMPLETED;
    const capturedAtUtc = new Date().toISOString();

    try {
      if (!navigator.onLine) {
        // Modo offline
        const { savePendingUpload } = await import("../src/services/offlineStorage");
        const response = await fetch(delivery.imageUrl || '');
        const blob = await response.blob();
        const file = new File([blob], `photo_${delivery.id}.jpg`, { type: "image/jpeg" });

        await savePendingUpload(numSeq, file, newStatus, capturedAtUtc, isPartial);
        alert("Sem internet! 📶\nA foto foi salva e será enviada automaticamente quando a conexão voltar.");
        // Atualizar lista local
        setPendingDeliveries(prev => prev.filter(d => d.id !== delivery.id));
      } else {
        // Modo online - precisa tirar foto primeiro
        const image = await Camera.getPhoto({
          quality: 50,
          width: 1024,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
          saveToGallery: false,
          webUseInput: true,
        });

        if (image.webPath) {
          const response = await fetch(image.webPath);
          const blob = await response.blob();
          const file = new File([blob], `photo_${delivery.id}.jpg`, { type: "image/jpeg" });

          let imageUrl: string | null = null;
          try {
            imageUrl = await uploadImageToSupabase(file);
            if (!imageUrl) {
              throw new Error('Upload retornou null');
            }
          } catch (error: any) {
            console.error('Erro no upload:', error);
            alert(`Erro ao enviar foto:\n${error.message || 'Erro desconhecido'}\n\nVerifique:\n- Conexão com internet\n- Configurações do Supabase no .env`);
            setIsUploading(null);
            return;
          }

          const success = await updateStatusOnBackend(numSeq, newStatus, imageUrl, isPartial);
          if (success) {
            alert("✅ Foto enviada com sucesso!");
            // Recarregar a página atual para atualizar a lista
            fetchPendingDeliveries(currentPage);
          }
        }
      }
    } catch (err: any) {
      console.error("Erro no upload:", err);
      if (err.message && !err.message.includes("User cancelled")) {
        alert("Ocorreu um erro ao processar a imagem.");
      }
    } finally {
      setIsUploading(null);
    }
  };

  // Filtrar por termo de busca (filtro local na página atual)
  const filteredHistory = pendingDeliveries.filter(d =>
    d.billId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.id.includes(searchTerm) ||
    d.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Formatar data para exibição
  const formatDeliveryDate = (delivery: Delivery & { deliveryDate?: string }) => {
    const dateString = delivery.deliveryDate;
    if (!dateString) return 'Data não disponível';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch {
      return 'Data inválida';
    }
  };

  // Funções de navegação de página
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      handlePageNavigation(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      handlePageNavigation(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePageChange = (page: number) => {
    handlePageNavigation(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="pt-20 px-4 pb-24 min-h-screen bg-slate-50">
      <div className="fixed top-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 pt-10 pb-3 px-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-800">Entregas Pendentes</h1>
          <button
            onClick={() => setShowDateFilter(!showDateFilter)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Filtrar por data"
          >
            <Filter size={20} />
          </button>
        </div>

        {/* Filtro de data */}
        {showDateFilter && (
          <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => setDateFilter('today')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${dateFilter === 'today'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
              >
                Hoje
              </button>
              <button
                onClick={() => setDateFilter('week')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${dateFilter === 'week'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
              >
                7 dias
              </button>
              <button
                onClick={() => setDateFilter('month')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${dateFilter === 'month'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
              >
                30 dias
              </button>
              <button
                onClick={() => setDateFilter('all')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${dateFilter === 'all'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
              >
                Todas
              </button>
            </div>

            {dateFilter === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm border border-slate-200 focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="Data inicial"
                />
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm border border-slate-200 focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="Data final"
                />
              </div>
            )}

            <button
              onClick={() => {
                setDateFilter('custom');
                setShowDateFilter(true);
              }}
              className="w-full mt-2 px-3 py-2 rounded-lg text-sm font-medium bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            >
              Período personalizado
            </button>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder={isAdmin ? "Pesquisar em TODOS os motoristas..." : "Digite o número do pedido ou nota..."}
            className="w-full bg-slate-100 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-20 space-y-3">
        {(dateFilter === null && (!isAdmin || searchTerm.length < 3)) ? (
          <div className="flex flex-col items-center justify-center pt-20 text-slate-400">
            <Filter size={48} className="mb-4 text-slate-300" />
            <p className="font-bold text-slate-600 mb-1">Histórico de Entregas</p>
            <p className="text-sm text-center max-w-xs">{isAdmin ? "Digite pelo menos 3 caracteres na busca para pesquisar em toda a base." : "Selecione um filtro acima (Hoje, Semana, etc) para visualizar suas entregas passadas."}</p>
          </div>
        ) : (loading && pendingDeliveries.length === 0) ? (
          <div className="flex flex-col items-center justify-center pt-10 text-slate-400">
            <div className="animate-spin h-8 w-8 border-4 border-brand-500 border-t-transparent rounded-full mb-2"></div>
            <p>Carregando entregas pendentes...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-10 text-slate-400">
            <Package size={48} className="mb-2 opacity-20" />
            <p>Nenhuma entrega pendente encontrada.</p>
          </div>
        ) : (
          filteredHistory.map((item) => (
            <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-mono text-slate-400">#{item.id}</span>
                  <h3 className="font-bold text-slate-700">{item.customerName}</h3>
                </div>
                <div className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-md font-bold flex items-center gap-1">
                  <AlertCircle size={12} />
                  PENDENTE
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <MapPin size={12} className="text-brand-500" />
                {item.district}
              </div>

              <div className="flex items-center justify-between border-t border-slate-50 pt-2 mt-1">
                <div className="flex flex-col gap-0.5">
                  {isAdmin && (item as any).nomMot && (
                    <div className="text-brand-600 font-bold text-xs uppercase">
                      Motorista: {(item as any).nomMot}
                    </div>
                  )}
                  <span className="text-xs text-slate-400 font-medium">
                    Bilhete: <span className="text-slate-800 font-bold">{(item as any).bilhete || item.id}</span>
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    Nota Fiscal: <span className="text-slate-600">{item.billId}</span>
                  </span>
                </div>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Calendar size={12} /> {formatDeliveryDate(item)}
                </span>
              </div>

              {/* Botão para enviar foto */}
              <button
                onClick={() => processPhotoUpload(item, false)}
                disabled={isUploading === item.id}
                className={`mt-2 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isUploading === item.id
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-500/30'
                  }`}
              >
                {isUploading === item.id ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <CameraIcon size={18} />
                    <span>Enviar Foto Comprovante</span>
                  </>
                )}
              </button>
            </div>
          ))
        )}

        {/* Controles de Paginação */}
        {!loading && totalPages > 1 && (
          <div className="mt-6 flex flex-col items-center gap-4 pb-4">
            {/* Informação da página */}
            <div className="text-sm text-slate-600">
              Página {currentPage} de {totalPages} • {totalItems} entregas pendentes
            </div>

            {/* Botões de navegação */}
            <div className="flex items-center gap-2">
              {/* Botão Anterior */}
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${currentPage === 1
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 shadow-sm'
                  }`}
              >
                <ChevronLeft size={18} />
                Anterior
              </button>

              {/* Números das páginas */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-all ${currentPage === pageNum
                        ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/30'
                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                        }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              {/* Botão Próximo */}
              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${currentPage === totalPages
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 shadow-sm'
                  }`}
              >
                Próximo
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
