import React, { useState, useEffect } from 'react';
import {
    ArrowLeft,
    CheckCircle2,
    XCircle,
    Camera,
    AlertTriangle,
    Save,
    Plus,
    Trash2,
    Truck,
    User,
    Search,
    ChevronDown
} from 'lucide-react';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { getApiUrl } from '../src/apiConfig';
import { uploadImageToSupabase } from '../src/services/supabaseService';

interface ChecklistItemProps {
    id: string;
    category: string;
    question: string;
    status: 'OK' | 'PROBLEM' | null;
    observation?: string;
    onAnswer: (status: 'OK' | 'PROBLEM') => void;
    onObservationChange: (text: string) => void;
}

const ChecklistItem: React.FC<ChecklistItemProps> = ({
    category,
    question,
    status,
    observation,
    onAnswer,
    onObservationChange
}) => {
    return (
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm mb-3">
            <span className="text-[10px] font-bold text-brand-600 uppercase tracking-wider mb-1 block">
                {category}
            </span>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">{question}</h3>

            <div className="flex gap-2">
                <button
                    onClick={() => onAnswer('OK')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border transition-all ${status === 'OK'
                        ? 'bg-green-50 border-green-500 text-green-700'
                        : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                        }`}
                >
                    <CheckCircle2 size={18} />
                    <span className="text-xs font-bold">OK</span>
                </button>

                <button
                    onClick={() => onAnswer('PROBLEM')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border transition-all ${status === 'PROBLEM'
                        ? 'bg-red-50 border-red-500 text-red-700'
                        : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                        }`}
                >
                    <XCircle size={18} />
                    <span className="text-xs font-bold">PROBLEMA</span>
                </button>
            </div>

            {status === 'PROBLEM' && (
                <div className="mt-3 animate-fade-in">
                    <textarea
                        placeholder="Descreva o problema encontrado..."
                        value={observation || ''}
                        onChange={(e) => onObservationChange(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none h-20"
                    />
                </div>
            )}
        </div>
    );
};

interface ExtraOccurrence {
    id: string;
    photoUrl: string | null;
    observation: string;
}

const MOCK_VEHICLES = [
    "TMC-7I76", "QEF-2223", "QEX-6597", "JVU-9596", "NSG-3926",
    "OFN-3084", "OFN-0224", "OFN-3354", "NET-7512", "OSX-5275",
    "OSX-6735", "OSX-5415", "OTG-1613", "JVG-0550", "QEZ-0A23",
    "QEZ-0A63", "TVU-1J06", "OTX-5576", "DTA-7858", "DTA-8022",
    "QDF-0615", "QDF-0555", "FFB-3980", "NET-7511", "NET-6671",
    "EZL-9G07", "QEW-0791", "NSE-5200", "QEB-8529", "QDH-6529",
    "QDT-7229"
];

const QUESTIONS = [
    // MOTOR E NÍVEIS
    { id: '1', category: 'MOTOR', question: 'Nível de Óleo do Motor' },
    { id: '2', category: 'MOTOR', question: 'Nível de Óleo Hidráulico (Freio)' },
    { id: '3', category: 'MOTOR', question: 'Nível de Água de Arrefecimento' },

    // EXTERIOR E CABINE
    { id: '4', category: 'EXTERIOR', question: 'Para-brisa' },
    { id: '5', category: 'EXTERIOR', question: 'Espelhos Retrovisores' },
    { id: '6', category: 'EXTERIOR', question: 'Vidros Laterais' },
    { id: '7', category: 'CABINE', question: 'Cinto de Segurança' },
    { id: '8', 'category': 'CABINE', question: 'Condições Estofamentos (Bancos)' },
    { id: '9', category: 'CABINE', question: 'Luzes do Painel de Instrumentos' },

    // TACÓGRAFO
    { id: '10', category: 'DOCUMENTAÇÃO', question: 'Certificado do Tacógrafo' },
    { id: '11', category: 'CABINE', question: 'Funcionamento do Tacógrafo' },
    { id: '12', category: 'CABINE', question: 'Disco de Tacógrafo' },

    // FUNCIONAMENTO E SEGURANÇA
    { id: '13', category: 'CABINE', question: 'Fechadura das Portas' },
    { id: '14', category: 'CABINE', question: 'Condições dos Pedais' },
    { id: '15', category: 'MECÂNICA', question: 'Freios de Estacionamento' },
    { id: '16', category: 'MECÂNICA', question: 'Condições do Sistema de Freio' },

    // ILUMINAÇÃO E ELÉTRICA
    { id: '17', category: 'EXTERIOR', question: 'Tampas dos Tanques (Arla e Diesel)' },
    { id: '18', category: 'ELÉTRICA', question: 'Faróis, Faroletes e Vigias' },
    { id: '19', category: 'ELÉTRICA', question: 'Setas e Pisca Alerta' },

    // BAÚ E CARGA
    { id: '20', category: 'BAÚ', question: 'Condições da Estrutura do Baú' },
    { id: '21', category: 'BAÚ', question: 'Portas do Baú (Traseira e Lateral)' },
    { id: '22', category: 'BAÚ', question: 'Funcionamento do ThermoKing' },

    // ELÉTRICA TRASEIRA / OUTROS
    { id: '23', category: 'ELÉTRICA', question: 'Luz de Freio, Setas, Ré' },
    { id: '24', category: 'CABINE', question: 'Funcionamento da Buzina' },
    { id: '25', category: 'MECÂNICA', question: 'Bateria (Condições e Fixação)' },
    { id: '26', category: 'EXTERIOR', question: 'Palhetas e Funcionamento do Limpador' },

    // EQUIPAMENTOS E DOCUMENTOS
    { id: '27', category: 'SEGURANÇA', question: 'Sistemas de Rastreamento' },
    { id: '28', category: 'EQUIPAMENTOS', question: 'Carrinho de Carga (Condições)' },
    { id: '29', category: 'EQUIPAMENTOS', question: 'Macaco, Triângulo e Chave de Roda' },
    { id: '30', category: 'EQUIPAMENTOS', question: 'Estepe (Condições e Existência)' },
    { id: '31', category: 'SEGURANÇA', question: 'Extintor de Incêndio (Validade)' },
    { id: '32', category: 'DOCUMENTAÇÃO', question: 'Documento do Veículo (CRLV)' },
    { id: '33', category: 'DOCUMENTAÇÃO', question: 'Motorista Habilitado (CNH)' },
    { id: '34', category: 'GERAL', question: 'Lavagem e Higienização do Veículo' },
];

// Função utilitária para converter Data URL para File
const urlToFile = async (url: string, filename: string): Promise<File> => {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
};

interface PendingIssue {
    id: number;
    checklist_id: number;
    categoria: string;
    pergunta_texto: string;
    observacao: string;
    status: string;
    created_at: string;
    nome_motorista?: string;
}

export const Checklist: React.FC<{
    onBack: () => void;
    userName: string;
    codMotorista: string | null;
}> = ({ onBack, userName, codMotorista }) => {
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [isVehicleListOpen, setIsVehicleListOpen] = useState(false);
    const [vehicleSearch, setVehicleSearch] = useState('');
    const [answers, setAnswers] = useState<Record<string, { status: 'OK' | 'PROBLEM' | null; obs?: string }>>({});
    const [extraOccurrences, setExtraOccurrences] = useState<ExtraOccurrence[]>([]);
    const [pendingIssues, setPendingIssues] = useState<PendingIssue[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filtro de veículos
    const filteredVehicles = MOCK_VEHICLES.filter(v =>
        v.toLowerCase().includes(vehicleSearch.toLowerCase())
    );

    // Perguntas ativas (remove as que já estão pendentes)
    const activeQuestions = QUESTIONS.filter(q => 
        !pendingIssues.some(issue => String(issue.pergunta_id) === String(q.id))
    );

    // Inicializa respostas vazias apenas para as perguntas ATIVAS
    useEffect(() => {
        const initialAnswers: any = {};
        // Se mudar o veículo e filtrar as perguntas, precisamos garantir que o estado limpe as antigas ou se mantenha coerente
        // Vamos recriar o state baseado nas activeQuestions
        activeQuestions.forEach(q => {
            initialAnswers[q.id] = { status: null, obs: '' };
        });
        setAnswers(initialAnswers);
    }, [pendingIssues.length, selectedVehicle]); // Recalcula quando as pendências mudam

    // Busca pendências anteriores do veículo selecionado
    useEffect(() => {
        if (selectedVehicle) {
            setPendingIssues([]); // Limpa enquanto carrega
            fetch(getApiUrl(`checklist/pending/${selectedVehicle}`))
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setPendingIssues(data);
                    } else {
                        setPendingIssues([]);
                    }
                })
                .catch(err => {
                    console.error("Erro ao buscar pendencias", err);
                    setPendingIssues([]);
                });
        } else {
            setPendingIssues([]);
        }
    }, [selectedVehicle]);

    const handleAnswer = (id: string, status: 'OK' | 'PROBLEM') => {
        setAnswers(prev => ({
            ...prev,
            [id]: { ...prev[id], status }
        }));
    };

    const handleObservation = (id: string, text: string) => {
        setAnswers(prev => ({
            ...prev,
            [id]: { ...prev[id], obs: text }
        }));
    };

    const addOccurrence = () => {
        const newId = Date.now().toString();
        setExtraOccurrences(prev => [
            ...prev,
            { id: newId, photoUrl: null, observation: '' }
        ]);
    };

    const removeOccurrence = (id: string) => {
        setExtraOccurrences(prev => prev.filter(o => o.id !== id));
    };

    const updateOccurrence = (id: string, field: 'photoUrl' | 'observation', value: string) => {
        setExtraOccurrences(prev => prev.map(o =>
            o.id === id ? { ...o, [field]: value } : o
        ));
    };

    const takePhoto = async (id: string) => {
        try {
            // 🚨 Solicita permissão explicitamente para evitar tela preta
            const permissions = await CapacitorCamera.requestPermissions();
            if (permissions.camera !== 'granted') {
                alert("Atenção: Você precisa permitir o acesso à câmera para fotografar a ocorrência.");
                return;
            }

            const image = await CapacitorCamera.getPhoto({
                quality: 70,
                allowEditing: false,
                resultType: CameraResultType.DataUrl,
                source: CameraSource.Camera, // Força a câmera direta
                saveToGallery: false,
                webUseInput: true, // Estabilidade no navegador/PWA
            });

            if (image.dataUrl) {
                updateOccurrence(id, 'photoUrl', image.dataUrl);
            }
        } catch (err: any) {
            if (err && err.message !== 'User cancelled photos app') {
                console.error('Erro ao tirar foto:', err);
                alert("Não foi possível abrir a câmera. Tente novamente.");
            }
        }
    };

    // Validação Geral (usa activeQuestions agora)
    const areQuestionsAnswered = activeQuestions.every(q => {
        const ans = answers[q.id];
        if (!ans) return false; // Se não tem resposta inicializada
        if (!ans.status) return false;
        if (ans.status === 'PROBLEM' && (!ans.obs || ans.obs.trim() === '')) return false;
        return true;
    });

    // 🚨 ATUALIZAÇÃO: Foto é opcional na ocorrência extra, mas observação obrigatória.
    const areExtrasValid = extraOccurrences.every(o => o.observation.trim() !== '');

    const isFormValid = selectedVehicle !== '' && areQuestionsAnswered && areExtrasValid;

    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const handleSubmit = async () => {
        if (!isFormValid || !codMotorista) return;
        setIsSubmitting(true);

        try {
            // 1. Upload das fotos das ocorrências para o Supabase (SE HOUVER)
            const occurrencesWithUrls = await Promise.all(extraOccurrences.map(async (occ) => {
                if (occ.photoUrl) {
                    try {
                        const file = await urlToFile(occ.photoUrl, `occurrence_${occ.id}.jpg`);
                        const publicUrl = await uploadImageToSupabase(file, 'checklist-photos');
                        return {
                            ...occ,
                            photoUrl: publicUrl
                        };
                    } catch (err: any) {
                        console.error(`Erro ao fazer upload da ocorrência ${occ.id}:`, err);
                        // Se falhar upload, decide se cancela ou manda sem foto. Aqui vamos cancelar para avisar.
                        throw new Error(`Falha no upload da foto: ${err.message || 'Erro desconhecido'}`);
                    }
                }
                // Se não tem foto, passa com photoUrl null
                return occ;
            }));

            // 2. Preparar Payload (APENAS QUESTÕES ATIVAS)
            // Se uma questão foi filtrada (já tem pendência), não mandamos nada sobre ela neste checklist novo,
            // pois o problema antigo persiste.
            const payload = {
                motorista: codMotorista,
                veiculo: selectedVehicle,
                respostas: activeQuestions.map(q => ({
                    id: q.id,
                    category: q.category,
                    question: q.question,
                    status: answers[q.id]?.status,
                    obs: answers[q.id]?.obs
                })),
                ocorrencias: occurrencesWithUrls.map(o => ({
                    photoUrl: o.photoUrl || null,
                    observation: o.observation
                }))
            };

            // 3. Enviar para o Backend
            const response = await fetch(getApiUrl('checklist'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Erro ao salvar checklist no servidor');
            }

            const data = await response.json();
            console.log('Checklist salvo:', data);

            // 🚨 SUCESSO BONITO
            setShowSuccessModal(true);
            // Redireciona após fechar o modal ou após tempo

        } catch (error) {
            console.error('Erro no submit:', error);
            alert('Erro ao salvar checklist. Verifique sua conexão e tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (showSuccessModal) {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
                <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl animate-scale-up relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-green-500" />
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-200">
                        <CheckCircle2 size={40} strokeWidth={2.5} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 mb-2">Checklist Enviado!</h2>
                    <p className="text-slate-500 mb-8 leading-relaxed">
                        Seu checklist diário foi registrado com sucesso. Bom trabalho e boa viagem! 🚛
                    </p>
                    <button
                        onClick={onBack}
                        className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-bold tracking-wide shadow-xl shadow-slate-200 transition-all active:scale-95"
                    >
                        VOLTAR PARA O INÍCIO
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-slate-50 z-[60] overflow-y-auto animate-slide-up">
            {/* Header */}
            <div className="bg-white px-4 pt-10 pb-4 shadow-sm border-b border-slate-100 sticky top-0 z-[61]">
                <div className="flex items-center gap-3 mb-4">
                    <button
                        onClick={onBack}
                        className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-bold text-slate-800">Novo Checklist Diário</h1>
                        <p className="text-xs text-slate-500">Preencha todos os campos obrigatórios.</p>
                    </div>
                </div>

                {/* Info Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
                    <div className="relative">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-1.5 uppercase">
                            <Truck size={14} /> Selecione o Caminhão
                        </label>

                        <div
                            onClick={() => setIsVehicleListOpen(!isVehicleListOpen)}
                            className={`w-full h-12 px-4 flex items-center justify-between border rounded-xl cursor-pointer transition-all ${isVehicleListOpen ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200 bg-slate-50'
                                }`}
                        >
                            <span className={`font-semibold ${selectedVehicle ? 'text-slate-800' : 'text-slate-400'}`}>
                                {selectedVehicle || "Selecione a placa..."}
                            </span>
                            <ChevronDown size={20} className={`text-slate-400 transition-transform ${isVehicleListOpen ? 'rotate-180' : ''}`} />
                        </div>

                        {/* Custom Dropdown */}
                        {isVehicleListOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-[70] overflow-hidden animate-fade-in-down">
                                <div className="p-2 border-b border-slate-100 bg-slate-50">
                                    <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-lg focus-within:border-brand-500 transition-colors">
                                        <Search size={16} className="text-slate-400" />
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="Digitar placa..."
                                            className="bg-transparent w-full text-sm outline-none text-slate-700 placeholder:text-slate-400 uppercase"
                                            value={vehicleSearch}
                                            onChange={(e) => setVehicleSearch(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                </div>
                                <div className="max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                                    {filteredVehicles.length > 0 ? (
                                        filteredVehicles.map(v => (
                                            <div
                                                key={v}
                                                onClick={() => {
                                                    setSelectedVehicle(v);
                                                    setIsVehicleListOpen(false);
                                                    setVehicleSearch('');
                                                }}
                                                className={`px-4 py-3 text-sm font-bold border-b border-slate-50 last:border-0 cursor-pointer transition-colors flex items-center justify-between ${selectedVehicle === v
                                                    ? 'text-brand-600 bg-brand-50'
                                                    : 'text-slate-600 hover:bg-slate-50'
                                                    }`}
                                            >
                                                {v}
                                                {selectedVehicle === v && <CheckCircle2 size={16} />}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-4 text-center text-xs text-slate-400">
                                            Nenhuma placa encontrada.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-1.5 uppercase">
                            <User size={14} /> Motorista Responsável
                        </label>
                        <div className="w-full h-12 flex items-center px-4 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-medium">
                            {userName}
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4 pb-32 space-y-6">
                {/* 🚨 PENDÊNCIAS ANTERIORES DO VEÍCULO */}
                {pendingIssues.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm animate-fade-in">
                        <div className="flex items-center gap-2 mb-3 text-red-700">
                            <AlertTriangle size={20} />
                            <h2 className="font-bold">Pendências NÃO Resolvidas</h2>
                        </div>
                        <p className="text-xs text-red-600 mb-4 font-medium leading-relaxed">
                            Este veículo possui problemas relatados anteriormente que ainda não foram marcados como resolvidos pela manutenção.
                        </p>

                        <div className="space-y-3">
                            {pendingIssues.map(issue => (
                                <div key={issue.id} className="bg-white border border-red-100 rounded-lg p-3 shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] font-bold text-red-500 uppercase bg-red-50 px-2 py-0.5 rounded-full border border-red-100 tracking-wider">
                                            {issue.categoria || 'EXTRA'}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-semibold">
                                            {new Date(issue.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-800 mb-2">{issue.pergunta_texto}</h3>
                                    
                                    {/* Exibir foto se houver */}
                                    {issue.foto_url && (
                                        <div className="mb-2">
                                            <a href={issue.foto_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800">
                                                <Camera size={12} /> Ver Foto da Ocorrência
                                            </a>
                                        </div>
                                    )}

                                    {issue.observacao && (
                                        <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                                            <span className="italic block mb-1">"{issue.observacao}"</span>
                                            {issue.nome_motorista && (
                                                <span className="block text-[10px] text-slate-400 font-bold uppercase text-right">
                                                    — {issue.nome_motorista}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Perguntas */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-700">Checklist de Rotina</h2>
                        <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-1 rounded-full border border-amber-200">
                            OBRIGATÓRIO
                        </span>
                    </div>

                    {activeQuestions.map(q => (
                        <ChecklistItem
                            key={q.id}
                            {...q}
                            status={answers[q.id]?.status || null}
                            observation={answers[q.id]?.obs}
                            onAnswer={(status) => handleAnswer(q.id, status)}
                            onObservationChange={(text) => handleObservation(q.id, text)}
                        />
                    ))}
                    
                    {activeQuestions.length === 0 && (
                        <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <p className="text-sm">Todas as verificações de rotina já possuem pendências em aberto.</p>
                        </div>
                    )}
                </div>

                {/* Ocorrências Extras */}
                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-2 text-orange-600">
                        <AlertTriangle size={20} />
                        <h2 className="font-bold text-slate-800">Ocorrências Extras</h2>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">
                        Fotos são opcionais, mas descreva o problema detalhadamente.
                    </p>

                    {/* LÓGICA DE BLOQUEIO DO BOTÃO ADICIONAR */}
                    {(() => {
                        const lastOccurrence = extraOccurrences[extraOccurrences.length - 1];
                        // Pode adicionar se não houver nenhuma OU se a última estiver com TEXTO preenchido
                        const canAdd = !lastOccurrence || (lastOccurrence.observation.trim().length > 0);

                        return (
                            <button
                                onClick={() => {
                                    if (canAdd) addOccurrence();
                                }}
                                disabled={!canAdd}
                                className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-colors mb-4 ${canAdd
                                    ? 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'
                                    : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-70'
                                    }`}
                            >
                                <Plus size={18} />
                                {canAdd ? 'ADICIONAR OCORRÊNCIA' : 'PREENCHA A DESCRIÇÃO ANTERIOR'}
                            </button>
                        );
                    })()}

                    <div className="space-y-4">
                        {extraOccurrences.length === 0 && (
                            <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">
                                <p className="text-xs text-slate-400 italic px-4">
                                    Nenhuma ocorrência extra adicionada. Use o botão acima se houver algum problema extra.
                                </p>
                            </div>
                        )}

                        {extraOccurrences.map((occ, index) => (
                            <div key={occ.id} className="border border-slate-200 rounded-xl p-4 animate-scale-up relative bg-slate-50/50">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-xs font-bold text-slate-500">OCORRÊNCIA #{index + 1}</span>
                                    <button
                                        onClick={() => removeOccurrence(occ.id)}
                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="mb-3">
                                    <label className="text-[10px] font-bold text-slate-500 mb-1 block uppercase">Foto do Problema (Opcional)</label>
                                    <div
                                        onClick={() => takePhoto(occ.id)}
                                        className={`w-full h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${occ.photoUrl
                                            ? 'border-brand-500 bg-white'
                                            : 'border-slate-300 bg-white hover:bg-slate-50'
                                            }`}
                                    >
                                        {occ.photoUrl ? (
                                            <img src={occ.photoUrl} alt="Problema" className="w-full h-full object-cover" />
                                        ) : (
                                            <>
                                                <Camera size={32} className="text-slate-300 mb-2" />
                                                <span className="text-xs font-bold text-slate-400">CLIQUE PARA FOTOGRAFAR (OPCIONAL)</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 mb-1 block uppercase">Observação do Problema *</label>
                                    <textarea
                                        value={occ.observation}
                                        onChange={(e) => updateOccurrence(occ.id, 'observation', e.target.value)}
                                        placeholder="Explique o problema encontrado..."
                                        className="w-full p-3 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none h-20"
                                    />
                                    {occ.observation.trim() === '' && (
                                        <span className="text-[10px] text-red-400 mt-1 block">ⓘ Observação obrigatória para salvar</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.05)] z-[61]">
                {!isFormValid && (
                    <div className="mb-3 flex justify-center">
                        <span className="text-[10px] font-bold text-red-500 bg-red-50 px-3 py-1 rounded-full border border-red-100 flex items-center gap-1">
                            <AlertTriangle size={10} /> COMPLETE TODAS AS INFORMAÇÕES
                        </span>
                    </div>
                )}
                <button
                    onClick={handleSubmit}
                    disabled={!isFormValid || isSubmitting}
                    className={`w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 ${isFormValid
                        ? 'bg-slate-800 text-white hover:bg-slate-900 shadow-slate-500/30'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        }`}
                >
                    {isSubmitting ? (
                        'SALVANDO...'
                    ) : (
                        <>
                            <Save size={20} /> SALVAR CHECKLIST
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
