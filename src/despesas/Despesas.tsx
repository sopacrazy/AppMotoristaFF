import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Receipt,
  Plus,
  Camera,
  Tag,
  Save,
  CheckCircle2,
  Play,
  Wallet,
  Calendar as CalendarIcon,
  Store,
  X,
  Printer,
  Download,
  FileText,
  Pencil,
  Trash2,
  MapPin
} from 'lucide-react';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share as CapacitorShare } from '@capacitor/share';
import { Filesystem as CapacitorFilesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import jsPDF from 'jspdf';

import html2canvas from 'html2canvas';
import { uploadBase64ToSupabase } from '../services/supabaseService';
import { ExpenseSnapshot, getPendingExpenseReport, queueExpenseReport, syncPendingExpenseReports } from '../services/expenseSync';

interface ExpenseItem {
  id: string;
  date: string; // DD/MM/AAAA
  fornecedor: string;
  category: string; // Produto ou Serviço
  customCategory?: string; // Preenchido se selecionar 'Outros'
  amount: string;
  photoUrl: string | null;
}

const PRODUCT_SERVICE_OPTIONS = [
  'Chapa',
  'Hospedagem',
  'Refeição',
  'Café da manhã',
  'Borracharia',
  'Pedágio',
  'Balsa',
  'Combustível',
  'Manutenção',
  'Outros'
];

interface DespesasProps {
  onBack: () => void;
  codMotorista?: string | null;
  codigoRota?: string | null;
  userName?: string;
}

// Helper para formatar data ISO YYYY-MM-DD em DD/MM/AAAA
const formatDateToBR = (isoDate: string) => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
};

const formatDateToISO = (brDate: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(brDate);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : getTodayISODate();
};

// Helper para obter a data de hoje no formato YYYY-MM-DD
const getTodayISODate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper para máscara de moeda brasileira no estilo digitação por centavos (ex: 6 -> 0,06 -> 0,60 -> 6,00)
const formatCurrencyBR = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const cents = parseInt(digits, 10);
  if (cents === 0) return '';
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const Despesas: React.FC<DespesasProps> = ({ onBack, codMotorista, codigoRota, userName }) => {
  const driverKey = codMotorista ? String(codMotorista).trim() : 'guest';

  // Helper para obter valor do localStorage isolado pelo motorista (com fallback para chave legado)
  const getStoredValue = <T,>(suffix: string, parseFn: (val: string) => T, fallback: T): T => {
    const key = `app_despesas_${suffix}_${driverKey}`;
    const legacyKey = `app_despesas_${suffix}`;

    const saved = localStorage.getItem(key);
    if (saved !== null) return parseFn(saved);

    // Se não encontrou a chave do motorista atual, verifica se há dados antigos legados (não isolados)
    const legacy = localStorage.getItem(legacyKey);
    if (legacy !== null) return parseFn(legacy);

    return fallback;
  };

  // Session State (Persisted in localStorage per driver)
  const [isStarted, setIsStarted] = useState<boolean>(() => {
    return getStoredValue('iniciada', val => val === 'true', false);
  });

  const [initialAmount, setInitialAmount] = useState<number>(() => {
    return getStoredValue('valor_inicial', val => parseFloat(val) || 0, 0);
  });

  const [startDate, setStartDate] = useState<string>(() => {
    return getStoredValue('data_saida', val => val, '');
  });

  const [endDate, setEndDate] = useState<string>(() => {
    return getStoredValue('data_retorno', val => val, '');
  });

  const [destination, setDestination] = useState<string>(() => {
    return getStoredValue('destino', val => val, '');
  });

  const [expenses, setExpenses] = useState<ExpenseItem[]>(() => {
    return getStoredValue('itens', val => {
      try {
        return JSON.parse(val);
      } catch {
        return [];
      }
    }, []);
  });

  const [reportId, setReportId] = useState<string | null>(() =>
    getStoredValue('report_id', val => val, '') || ((isStarted || expenses.length > 0) ? crypto.randomUUID() : null)
  );
  const [startedAt, setStartedAt] = useState<string | null>(() => getStoredValue('iniciada_iso', val => val, '') || null);
  const [finishedAt, setFinishedAt] = useState<string | null>(() => getStoredValue('finalizada_iso', val => val, '') || null);
  const [expenseHydrated, setExpenseHydrated] = useState(false);
  const [expenseSyncState, setExpenseSyncState] = useState<'saved' | 'pending' | 'login'>('pending');

  // Modal State
  const [showStartModal, setShowStartModal] = useState<boolean>(false);
  const [startModalStep, setStartModalStep] = useState<1 | 2>(1);
  const [startInputValue, setStartInputValue] = useState<string>('');
  const [startLocationInput, setStartLocationInput] = useState<string>('');

  // Form State for Adding/Editing Expense
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [expenseDate, setExpenseDate] = useState<string>(getTodayISODate());
  const [fornecedor, setFornecedor] = useState<string>('');
  const [productService, setProductService] = useState<string>(PRODUCT_SERVICE_OPTIONS[0]);
  const [customProductService, setCustomProductService] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [isSavingExpense, setIsSavingExpense] = useState<boolean>(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Reset Form State
  const resetForm = () => {
    setEditingExpenseId(null);
    setExpenseDate(getTodayISODate());
    setFornecedor('');
    setProductService(PRODUCT_SERVICE_OPTIONS[0]);
    setCustomProductService('');
    setAmount('');
    setPhotoUrl(null);
    setUploadSuccessMsg(null);
    setShowForm(false);
  };

  // Start Editing Expense
  const handleStartEdit = (item: ExpenseItem) => {
    setEditingExpenseId(item.id);

    // Converte a data de DD/MM/AAAA para YYYY-MM-DD para o input type="date"
    if (item.date) {
      const parts = item.date.split('/');
      if (parts.length === 3) {
        setExpenseDate(`${parts[2]}-${parts[1]}-${parts[0]}`);
      } else {
        setExpenseDate(getTodayISODate());
      }
    } else {
      setExpenseDate(getTodayISODate());
    }

    setFornecedor(item.fornecedor || '');

    if (PRODUCT_SERVICE_OPTIONS.includes(item.category)) {
      setProductService(item.category);
      setCustomProductService('');
    } else {
      setProductService('Outros');
      setCustomProductService(item.category);
    }

    setAmount(parseFloat(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    setPhotoUrl(item.photoUrl);
    setUploadSuccessMsg(null);
    setShowForm(true);

    // Scroll para o formulário
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  // Delete Expense
  const handleDeleteExpense = async (id: string) => {
    if (window.confirm("Deseja realmente excluir este lançamento de despesa?")) {
      const nextExpenses = expenses.filter(item => item.id !== id);
      if (reportId) {
        try {
          await queueExpenseReport(snapshotForDatabase(reportId, endDate, finishedAt, nextExpenses));
        } catch (error) {
          console.error('Falha ao guardar exclusão da despesa:', error);
          alert('Não foi possível guardar a alteração no aparelho. Tente novamente.');
          return;
        }
      }
      setExpenses(nextExpenses);
      if (editingExpenseId === id) {
        resetForm();
      }
      setToastMessage("Lançamento de despesa excluído com sucesso.");
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Success / End Modal State & PDF Loading State
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);

  // Restore a queued report, including photos kept offline in IndexedDB.
  useEffect(() => {
    let cancelled = false;
    if (!reportId) {
      setExpenseHydrated(true);
      return;
    }
    let storageReady = true;
    getPendingExpenseReport(reportId)
      .then(async (pending) => {
        if (!pending && isStarted && expenses.some((item) => item.photoUrl?.startsWith('data:'))) {
          // Migrate photos from the old localStorage format before removing large data URLs there.
          await queueExpenseReport(snapshotForDatabase(reportId));
        }
        if (!pending || cancelled) return;
        setInitialAmount(pending.advanceAmount);
        setStartDate(pending.startDateText || '');
        setEndDate(pending.endDateText || '');
        setDestination(pending.destination);
        setStartedAt(pending.startedAt);
        setFinishedAt(pending.finishedAt);
        setExpenses(pending.items.map((item) => ({
          id: item.id, date: formatDateToBR(item.date), fornecedor: item.supplier,
          category: item.category, customCategory: item.customCategory,
          amount: item.amount, photoUrl: item.photoUrl,
        })));
      })
      .catch((error) => {
        storageReady = false;
        console.error('Falha ao recuperar despesas locais:', error);
      })
      .finally(() => { if (!cancelled && storageReady) setExpenseHydrated(true); });
    return () => { cancelled = true; };
  }, [driverKey]);

  // Persist State Changes per Driver Key
  useEffect(() => {
    if (!expenseHydrated) return;
    const keyStarted = `app_despesas_iniciada_${driverKey}`;
    const keyValue = `app_despesas_valor_inicial_${driverKey}`;
    const keySaida = `app_despesas_data_saida_${driverKey}`;
    const keyRetorno = `app_despesas_data_retorno_${driverKey}`;
    const keyDestino = `app_despesas_destino_${driverKey}`;
    const keyItens = `app_despesas_itens_${driverKey}`;

    localStorage.setItem(keyStarted, String(isStarted));
    localStorage.setItem(keyValue, String(initialAmount));
    // Large offline photos stay in IndexedDB rather than exhausting localStorage.
    localStorage.setItem(keyItens, JSON.stringify(expenses.map((item) => ({
      ...item, photoUrl: item.photoUrl?.startsWith('data:') ? null : item.photoUrl,
    }))));
    if (startDate) localStorage.setItem(keySaida, startDate);
    else localStorage.removeItem(keySaida);

    if (endDate) localStorage.setItem(keyRetorno, endDate);
    else localStorage.removeItem(keyRetorno);

    if (destination) localStorage.setItem(keyDestino, destination);
    else localStorage.removeItem(keyDestino);
  }, [expenseHydrated, isStarted, initialAmount, expenses, startDate, endDate, destination, driverKey]);

  useEffect(() => {
    const setOrRemove = (suffix: string, value: string | null) => {
      const key = `app_despesas_${suffix}_${driverKey}`;
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    };
    setOrRemove('report_id', reportId);
    setOrRemove('iniciada_iso', startedAt);
    setOrRemove('finalizada_iso', finishedAt);
  }, [reportId, startedAt, finishedAt, driverKey]);

  const snapshotForDatabase = (id: string, currentEndDate = endDate, currentFinishedAt = finishedAt, currentExpenses = expenses): ExpenseSnapshot => ({
    reportId: id,
    motorista: driverKey,
    routeCode: codigoRota || null,
    driverName: userName || null,
    destination,
    advanceAmount: initialAmount,
    startDateText: startDate || null,
    endDateText: currentEndDate || null,
    startedAt,
    finishedAt: currentFinishedAt,
    status: currentEndDate ? 'finished' : 'open',
    items: currentExpenses.map((item) => ({
      id: item.id,
      date: formatDateToISO(item.date),
      supplier: item.fornecedor,
      category: item.category,
      customCategory: item.customCategory,
      amount: item.amount,
      photoUrl: item.photoUrl,
    })),
  });

  const updateUploadedPhoto = (uploadedReportId: string, itemId: string, oldUrl: string, newUrl: string) => {
    if (localStorage.getItem(`app_despesas_report_id_${driverKey}`) !== uploadedReportId) return;
    setExpenses((previous) => previous.map((item) =>
      item.id === itemId && item.photoUrl === oldUrl ? { ...item, photoUrl: newUrl } : item
    ));
  };

  const refreshExpenseSync = async () => {
    try {
      const result = await syncPendingExpenseReports(driverKey, updateUploadedPhoto);
      setExpenseSyncState(result.authRequired ? 'login' : result.pending > 0 || result.error ? 'pending' : 'saved');
    } catch (error) {
      console.error('Falha ao sincronizar despesas:', error);
      setExpenseSyncState('pending');
    }
  };

  useEffect(() => {
    if (!expenseHydrated) return;
    void refreshExpenseSync();
    window.addEventListener('online', refreshExpenseSync);
    const interval = window.setInterval(refreshExpenseSync, 60_000);
    return () => {
      window.removeEventListener('online', refreshExpenseSync);
      window.clearInterval(interval);
    };
  }, [driverKey, expenseHydrated]);

  useEffect(() => {
    if (!expenseHydrated || !reportId || !isStarted || initialAmount <= 0 || !destination) return;
    setExpenseSyncState('pending');
    const timer = window.setTimeout(() => {
      queueExpenseReport(snapshotForDatabase(reportId))
        .then(refreshExpenseSync)
        .catch((error) => console.error('Falha ao guardar despesas para sincronização:', error));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [expenseHydrated, reportId, isStarted, initialAmount, destination, startDate, endDate, startedAt, finishedAt, expenses, userName, codigoRota, driverKey]);

  // Abrir Modal de Iniciar/Editar Prestação preenchendo os valores atuais e iniciando na Etapa 1
  const handleOpenStartModal = () => {
    setStartInputValue(initialAmount > 0 ? initialAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
    setStartLocationInput(destination || '');
    setStartModalStep(1);
    setShowStartModal(true);
  };

  // Etapa 1: Valida o valor recebido e avança para a Etapa 2 (Local / Destino)
  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanValue = parseFloat(startInputValue.replace(/\./g, '').replace(',', '.'));
    if (isNaN(cleanValue) || cleanValue <= 0) {
      alert("Por favor, digite um valor válido recebido do financeiro.");
      return;
    }
    setStartModalStep(2);
  };

  // Etapa 2: Valida o local/destino e confirma o início da prestação
  const handleConfirmStartSession = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanValue = parseFloat(startInputValue.replace(/\./g, '').replace(',', '.'));
    if (isNaN(cleanValue) || cleanValue <= 0) {
      alert("Por favor, digite um valor válido recebido do financeiro.");
      setStartModalStep(1);
      return;
    }

    if (!startLocationInput.trim()) {
      alert("Por favor, informe o local / destino da rota.");
      return;
    }

    if (!startDate) {
      const nowFormatted = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setStartDate(nowFormatted);
    }

    setInitialAmount(cleanValue);
    setDestination(startLocationInput.trim());
    if (!reportId) setReportId(crypto.randomUUID());
    if (!startedAt) setStartedAt(new Date().toISOString());
    setIsStarted(true);
    setShowStartModal(false);
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const processAndUploadPhoto = async (dataUrl: string) => {
    setIsUploadingPhoto(true);
    setUploadSuccessMsg(null);
    try {
      // Envia a imagem para o bucket exclusivo 'despesas' no Supabase
      const uploadedUrl = await uploadBase64ToSupabase(dataUrl, 'despesa', 'despesas');
      if (uploadedUrl) {
        setPhotoUrl(uploadedUrl);
        setUploadSuccessMsg("✅ Foto enviada ao Supabase com sucesso!");
      } else {
        setPhotoUrl(dataUrl);
        setUploadSuccessMsg("⚠️ Imagem mantida offline.");
      }
    } catch (uploadErr) {
      console.error("Erro ao enviar foto para o Supabase, utilizando foto local:", uploadErr);
      // Em caso de erro/sem internet, mantém a foto local em dataUrl
      setPhotoUrl(dataUrl);
      setUploadSuccessMsg("⚠️ Falha no Supabase. Foto salva localmente.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSelectFileFromPC = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        processAndUploadPhoto(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleTakePhoto = async () => {
    if (isUploadingPhoto) return;

    // Se for no navegador Web (localhost / PC), abre o gerenciador de arquivos do PC
    if (!Capacitor.isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }

    // Se for no Android nativo, usa a Câmera nativa
    try {
      const permissions = await CapacitorCamera.requestPermissions();
      if (permissions.camera !== 'granted') {
        alert("Atenção: Você precisa permitir o acesso à câmera para fotografar o comprovante.");
        return;
      }

      const image = await CapacitorCamera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false,
        webUseInput: true,
      });

      if (image.dataUrl) {
        await processAndUploadPhoto(image.dataUrl);
      }
    } catch (err: any) {
      if (err && err.message !== 'User cancelled photos app') {
        console.error('Erro ao tirar foto do comprovante:', err);
        // Fallback: se falhar a câmera no Web, tenta abrir o seletor de arquivos
        fileInputRef.current?.click();
      }
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAmount = amount.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(cleanAmount);
    if (isNaN(val) || val <= 0) {
      alert("Por favor, informe um valor válido para a despesa.");
      return;
    }

    if (productService === 'Outros' && !customProductService.trim()) {
      alert("Por favor, especifique o produto ou serviço no campo 'Outros'.");
      return;
    }

    const finalCategory = productService === 'Outros' ? customProductService.trim() : productService;

    const changedExpense: ExpenseItem = {
      id: editingExpenseId || crypto.randomUUID(),
      date: formatDateToBR(expenseDate),
      fornecedor: fornecedor.trim(),
      category: finalCategory,
      customCategory: productService === 'Outros' ? customProductService.trim() : undefined,
      amount: val.toString(),
      photoUrl,
    };
    const nextExpenses = editingExpenseId
      ? expenses.map((item) => item.id === editingExpenseId ? changedExpense : item)
      : [changedExpense, ...expenses];
    setIsSavingExpense(true);
    try {
      if (!reportId) throw new Error('Prestação sem identificador');
      await queueExpenseReport(snapshotForDatabase(reportId, endDate, finishedAt, nextExpenses));
    } catch (error) {
      console.error('Falha ao guardar lançamento de despesa:', error);
      alert('Não foi possível guardar a despesa no aparelho. Tente novamente.');
      setIsSavingExpense(false);
      return;
    }
    setIsSavingExpense(false);
    setExpenses(nextExpenses);
    if (editingExpenseId) {
      setToastMessage(`Despesa atualizada com sucesso! Novo valor: R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    } else {
      if (photoUrl) {
        if (photoUrl.startsWith('http')) {
          setToastMessage(`Despesa de R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} adicionada! Comprovante enviado e salvo no Supabase com sucesso.`);
        } else {
          setToastMessage(`Despesa de R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} adicionada! (Comprovante salvo no dispositivo)`);
        }
      } else {
        setToastMessage(`Despesa de R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} adicionada com sucesso!`);
      }
    }

    // Auto fechar a mensagem de aviso após 5 segundos
    setTimeout(() => {
      setToastMessage(null);
    }, 5000);

    resetForm();
  };

  // Handle Finishing the Session & Setting Data de Retorno
  const handleFinishSession = async () => {
    const nowFormatted = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const nowIso = new Date().toISOString();
    try {
      if (!reportId) throw new Error('Prestação sem identificador');
      await queueExpenseReport(snapshotForDatabase(reportId, nowFormatted, nowIso));
    } catch (error) {
      console.error('Falha ao guardar finalização da prestação:', error);
      alert('Não foi possível guardar a prestação no aparelho. Tente novamente.');
      return;
    }
    setEndDate(nowFormatted);
    setFinishedAt(nowIso);
    setShowSuccessModal(true);
  };

  const handleResetSession = async () => {
    if (reportId) {
      try {
        await queueExpenseReport(snapshotForDatabase(reportId));
        void refreshExpenseSync();
      } catch (error) {
        console.error('Prestação ainda pendente de envio:', error);
        alert('Não foi possível guardar a prestação no aparelho. Tente novamente.');
        return;
      }
    }
    setIsStarted(false);
    setReportId(null);
    setStartedAt(null);
    setFinishedAt(null);
    setInitialAmount(0);
    setStartDate('');
    setEndDate('');
    setDestination('');
    setExpenses([]);
    setShowSuccessModal(false);

    // Limpa as chaves específicas do motorista atual
    localStorage.removeItem(`app_despesas_iniciada_${driverKey}`);
    localStorage.removeItem(`app_despesas_valor_inicial_${driverKey}`);
    localStorage.removeItem(`app_despesas_data_saida_${driverKey}`);
    localStorage.removeItem(`app_despesas_data_retorno_${driverKey}`);
    localStorage.removeItem(`app_despesas_destino_${driverKey}`);
    localStorage.removeItem(`app_despesas_itens_${driverKey}`);
    localStorage.removeItem(`app_despesas_report_id_${driverKey}`);
    localStorage.removeItem(`app_despesas_iniciada_iso_${driverKey}`);
    localStorage.removeItem(`app_despesas_finalizada_iso_${driverKey}`);

    // Limpa também as chaves legadas globais se existirem
    localStorage.removeItem('app_despesas_iniciada');
    localStorage.removeItem('app_despesas_valor_inicial');
    localStorage.removeItem('app_despesas_data_saida');
    localStorage.removeItem('app_despesas_data_retorno');
    localStorage.removeItem('app_despesas_destino');
    localStorage.removeItem('app_despesas_itens');
  };

  const totalSpent = expenses.reduce((acc, curr) => {
    return acc + (parseFloat(curr.amount) || 0);
  }, 0);

  const remainingBalance = initialAmount - totalSpent;

  // Função para Gerar e Baixar o PDF com as novas especificações
  const handleDownloadPDF = async () => {
    const element = document.getElementById('pdf-report-template');
    if (!element) return;

    setIsGeneratingPDF(true);

    element.style.position = 'fixed';
    element.style.left = '0px';
    element.style.top = '0px';
    element.style.zIndex = '-9999';
    element.style.display = 'block';

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const fileName = `Relatorio_Despesas_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
      const pdfDataUrl = pdf.output('datauristring');

      let sharedSuccessfully = false;

      // 1. Tenta via Plugin Nativo Filesystem + CapacitorShare (se o APK nativo possuir o plugin compilado)
      if (Capacitor.isNativePlatform()) {
        try {
          if (Capacitor.isPluginAvailable('Filesystem')) {
            const base64Data = pdfDataUrl.includes(',') ? pdfDataUrl.split(',')[1] : pdfDataUrl;

            const savedFile = await CapacitorFilesystem.writeFile({
              path: fileName,
              data: base64Data,
              directory: Directory.Cache,
            });

            console.log('📄 PDF salvo no cache nativo:', savedFile.uri);

            if (Capacitor.isPluginAvailable('Share')) {
              await CapacitorShare.share({
                title: 'Relatório de Prestação de Contas',
                text: 'Segue o relatório de prestação de contas Fort Fruit.',
                files: [savedFile.uri],
                url: savedFile.uri,
                dialogTitle: 'Compartilhar Relatório de Despesas',
              });
              sharedSuccessfully = true;
            }
          }
        } catch (nativeErr: any) {
          console.warn('Falha ou ausência do plugin nativo Filesystem/Share:', nativeErr);
          if (nativeErr?.name === 'AbortError' || nativeErr?.message?.includes('canceled') || nativeErr?.message?.includes('cancelled')) {
            sharedSuccessfully = true;
          }
        }

        // Se o Filesystem nativo falhou ou não está compilado no APK, tenta compartilhar via Share nativo diretamente com a Data URI
        if (!sharedSuccessfully && Capacitor.isPluginAvailable('Share')) {
          try {
            await CapacitorShare.share({
              title: 'Relatório de Prestação de Contas',
              text: 'Segue o relatório de prestação de contas Fort Fruit.',
              url: pdfDataUrl,
              dialogTitle: 'Compartilhar Relatório de Despesas',
            });
            sharedSuccessfully = true;
          } catch (shareErr: any) {
            console.warn('Falha ao compartilhar URL via CapacitorShare:', shareErr);
            if (shareErr?.name === 'AbortError' || shareErr?.message?.includes('canceled') || shareErr?.message?.includes('cancelled')) {
              sharedSuccessfully = true;
            }
          }
        }
      }

      // 2. Fallback: Web Share API (navigator.share) ou Blob File Share
      if (!sharedSuccessfully && typeof navigator !== 'undefined') {
        const blob = pdf.output('blob');
        const pdfFile = new File([blob], fileName, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          try {
            await navigator.share({
              files: [pdfFile],
              title: 'Relatório de Prestação de Contas',
              text: 'Segue o relatório de prestação de contas Fort Fruit.',
            });
            sharedSuccessfully = true;
          } catch (webShareErr: any) {
            console.warn('Falha no compartilhamento web (navigator.share com arquivo):', webShareErr);
            if (webShareErr?.name === 'AbortError' || webShareErr?.message?.includes('canceled') || webShareErr?.message?.includes('cancelled')) {
              sharedSuccessfully = true;
            }
          }
        }

        if (!sharedSuccessfully && navigator.share) {
          try {
            await navigator.share({
              title: 'Relatório de Prestação de Contas',
              text: 'Segue o relatório de prestação de contas Fort Fruit.',
              url: pdfDataUrl
            });
            sharedSuccessfully = true;
          } catch (webShareErr2: any) {
            console.warn('Falha no compartilhamento web (navigator.share com URL):', webShareErr2);
            if (webShareErr2?.name === 'AbortError' || webShareErr2?.message?.includes('canceled') || webShareErr2?.message?.includes('cancelled')) {
              sharedSuccessfully = true;
            }
          }
        }
      }

      // 3. Fallback Final: Salvamento/Download direto ou Abertura em nova janela (data URI / Blob URL)
      if (!sharedSuccessfully) {
        try {
          pdf.save(fileName);
        } catch (saveErr) {
          console.warn('pdf.save() falhou, abrindo via Data URI:', saveErr);
          const pdfWindow = window.open();
          if (pdfWindow) {
            pdfWindow.document.write(
              `<iframe width='100%' height='100%' src='${pdfDataUrl}'></iframe>`
            );
          } else {
            window.location.href = pdfDataUrl;
          }
        }
      }
    } catch (error: any) {
      console.error('Erro ao gerar PDF:', error);
      alert(`Não foi possível gerar o PDF: ${error?.message || error || 'Erro desconhecido'}`);
    } finally {
      element.style.position = 'absolute';
      element.style.left = '-9999px';
      element.style.top = '-9999px';
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-50 z-[60] overflow-y-auto animate-slide-up">
      {/* TEMPLATE OCULTO PARA GERAÇÃO DO PDF EXATAMENTE NO MODELO SOLICITADO */}
      <div
        id="pdf-report-template"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: '-9999px',
          width: '800px',
          padding: '32px',
          background: '#ffffff',
          fontFamily: 'Arial, sans-serif',
          fontSize: '12px',
          color: '#1f2937'
        }}
      >
        {/* CABEÇALHO DO PDF: LOGO NA ESQUERDA, EMPRESA E DATAS / NOME DO COLABORADOR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', borderBottom: '2px solid #16a34a', paddingBottom: '16px' }}>
          {/* Lado Esquerdo: Logo e Dados da Empresa */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img src="/assets/FF.png" alt="Fort Fruit Logo" style={{ height: '65px', objectFit: 'contain' }} />
            <div>
              <h1 style={{ margin: 0, color: '#16a34a', fontSize: '20px', fontWeight: 'bold', lineHeight: 1.2 }}>
                Fort Fruit LTDA
              </h1>
              <p style={{ margin: '3px 0 0 0', color: '#4b5563', fontSize: '13px', fontWeight: 500 }}>
                Alameda Ceasa - Belém-PA
              </p>
            </div>
          </div>

          {/* Lado Direito: Nome do Colaborador, Local/Destino, Data de Saída, Data de Retorno */}
          <div style={{ textAlign: 'right', fontSize: '12px', color: '#374151', lineHeight: '1.6' }}>
            <p style={{ margin: 0 }}><strong>Colaborador:</strong> {userName || 'Motorista'}</p>
            {destination && <p style={{ margin: 0 }}><strong>Local / Destino:</strong> {destination}</p>}
            <p style={{ margin: 0 }}><strong>Data de Saída:</strong> {startDate || new Date().toLocaleDateString('pt-BR')}</p>
            <p style={{ margin: 0 }}><strong>Data de Retorno:</strong> {endDate || new Date().toLocaleDateString('pt-BR')}</p>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '11px' }}><strong>Gerado em:</strong> {new Date().toLocaleDateString('pt-BR')}</p>
          </div>
        </div>

        {/* TÍTULO CENTRALIZADO */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ margin: 0, color: '#16a34a', fontSize: '22px', fontWeight: 'bold' }}>
            Relatório de Prestação de Contas
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '12px', fontStyle: 'italic' }}>
            Total de registros encontrados nesta prestação: {expenses.length}
          </p>
        </div>

        {/* BARRINHA DE RESUMO (Sem o motorista no meio) */}
        <div style={{ display: 'flex', justify: 'space-around', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 20px', marginBottom: '24px' }}>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: '#166534', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>Valor Recebido</span>
            <span style={{ fontSize: '14px', color: '#14532d', fontWeight: 'bold' }}>R$ {initialAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div style={{ textAlign: 'center', borderLeft: '1px solid #bbf7d0', borderRight: '1px solid #bbf7d0', paddingLeft: '32px', paddingRight: '32px' }}>
            <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>Total Gasto</span>
            <span style={{ fontSize: '14px', color: '#dc2626', fontWeight: 'bold' }}>R$ {totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>Saldo Restante</span>
            <span style={{ fontSize: '14px', color: '#16a34a', fontWeight: 'bold' }}>R$ {remainingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* TABELA DE DESPESAS (Sem a coluna de motorista) */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '32px' }}>
          <thead>
            <tr style={{ backgroundColor: '#16a34a', color: '#ffffff' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold' }}>Data</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold' }}>Fornecedor</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold' }}>Produto / Serviço</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 'bold' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((exp, idx) => (
              <tr key={exp.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '10px 12px', fontSize: '12px', color: '#374151' }}>{exp.date}</td>
                <td style={{ padding: '10px 12px', fontSize: '12px', color: '#374151' }}>{exp.fornecedor || '-'}</td>
                <td style={{ padding: '10px 12px', fontSize: '12px', color: '#374151' }}>{exp.category}</td>
                <td style={{ padding: '10px 12px', fontSize: '12px', color: '#111827', fontWeight: 'bold', textAlign: 'right' }}>
                  R$ {parseFloat(exp.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>



        {/* 3 CAMPOS DE ASSINATURA NO FIM DA PÁGINA */}
        <div style={{ marginTop: '60px', paddingTop: '20px', pageBreakInside: 'avoid' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', textAlign: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ borderTop: '1px solid #374151', marginBottom: '8px', width: '85%', marginLeft: 'auto', marginRight: 'auto' }}></div>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 'bold', color: '#374151' }}>Assinatura do Colaborador</p>
              <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#6b7280' }}>{userName || 'Motorista'}</p>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ borderTop: '1px solid #374151', marginBottom: '8px', width: '85%', marginLeft: 'auto', marginRight: 'auto' }}></div>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 'bold', color: '#374151' }}>Gestor Imediato</p>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ borderTop: '1px solid #374151', marginBottom: '8px', width: '85%', marginLeft: 'auto', marginRight: 'auto' }}></div>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 'bold', color: '#374151' }}>Financeiro</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white px-4 pt-10 pb-4 shadow-sm border-b border-slate-100 sticky top-0 z-[61]">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800">Lançamento de Despesas</h1>
            <p className="text-xs text-slate-500">Prestação de contas da rota</p>
          </div>
          <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
            <Receipt size={24} />
          </div>
        </div>
      </div>

      {/* MODAL ETAPA 1: DIGITAR VALOR DO FINANCEIRO */}
      {showStartModal && startModalStep === 1 && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full animate-scale-up relative border border-slate-100">
            <button
              onClick={() => setShowStartModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X size={20} />
            </button>

            <div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
              <Wallet size={32} />
            </div>

            <h3 className="text-xl font-black text-slate-800 text-center mb-1">Iniciar Prestação</h3>
            <p className="text-slate-500 text-xs text-center mb-6 leading-relaxed">
              Quanto você pegou no <strong>financeiro</strong> para esta rota?
            </p>

            <form onSubmit={handleStep1Next} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 mb-1.5 block uppercase">Valor Recebido (R$) *</label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-slate-400 font-bold text-base">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0,00"
                    value={startInputValue}
                    onChange={(e) => setStartInputValue(formatCurrencyBR(e.target.value))}
                    className="w-full h-14 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 font-black text-xl focus:ring-2 focus:ring-teal-500 outline-none"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-teal-600/30 transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-wide"
              >
                Próximo <ArrowLeft size={18} className="rotate-180" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ETAPA 2: DIGITAR LOCAL / DESTINO DA ROTA */}
      {showStartModal && startModalStep === 2 && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full animate-scale-up relative border border-slate-100">
            <button
              onClick={() => setShowStartModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X size={20} />
            </button>

            <div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
              <MapPin size={32} />
            </div>

            <h3 className="text-xl font-black text-slate-800 text-center mb-1">Destino da Rota</h3>
            <p className="text-slate-500 text-xs text-center mb-6 leading-relaxed">
              Para qual <strong>local ou cidade</strong> você está indo nesta rota?
            </p>

            <form onSubmit={handleConfirmStartSession} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 mb-1.5 block uppercase">Local / Destino da Rota *</label>
                <input
                  type="text"
                  placeholder="Ex: Belém, Castanhal, Rota Sul..."
                  value={startLocationInput}
                  onChange={(e) => setStartLocationInput(e.target.value)}
                  className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 font-bold text-base focus:ring-2 focus:ring-teal-500 outline-none"
                  autoFocus
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-teal-600/30 transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-wide"
              >
                <Play size={18} /> Confirmar & Iniciar
              </button>

              <button
                type="button"
                onClick={() => setStartModalStep(1)}
                className="w-full py-2 text-slate-400 hover:text-slate-600 font-bold text-xs uppercase"
              >
                Voltar ao Valor Recebido
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SUCESSO / GERAR PDF */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl animate-scale-up relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-teal-400 to-emerald-500" />
            <div className="w-20 h-20 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-teal-200">
              <CheckCircle2 size={40} strokeWidth={2.5} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">Prestação Concluída!</h2>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              Você iniciou com <strong>R$ {initialAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>,<br />
              gastou <strong>R$ {totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong><br />
              e restaram <strong>R$ {remainingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>.
            </p>

            {/* BOTÃO DE GERAÇÃO DE PDF */}
            <div className="space-y-3">
              <button
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF}
                className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-teal-600/30 transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-wide"
              >
                {isGeneratingPDF ? (
                  'Gerando PDF...'
                ) : (
                  <>
                    <Download size={18} /> Gerar e Compartilhar PDF
                  </>
                )}
              </button>

              <button
                onClick={handleResetSession}
                className="w-full py-3 text-slate-400 hover:text-slate-600 font-bold text-xs uppercase"
              >
                Nova Prestação / Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 pb-32 space-y-6 max-w-md mx-auto">
        {/* BANNER DE NOTIFICAÇÃO AO CONFIRMAR ADIÇÃO */}
        {toastMessage && (
          <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-xl font-bold text-xs flex items-center justify-between animate-fade-in border border-emerald-500">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-emerald-200 flex-shrink-0" />
              {toastMessage}
            </span>
            <button onClick={() => setToastMessage(null)} className="text-white/80 hover:text-white p-1">
              <X size={16} />
            </button>
          </div>
        )}

        {/* CASO AINDA NÃO TENHA INICIADO A PRESTAÇÃO */}
        {!isStarted ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-center space-y-6 animate-scale-up mt-4">
            <div className="w-20 h-20 bg-teal-50 text-teal-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <Wallet size={40} />
            </div>

            <div>
              <h2 className="text-xl font-black text-slate-800 mb-2">Iniciar Despesas da Rota</h2>
              <p className="text-slate-500 text-xs leading-relaxed max-w-xs mx-auto">
                Esta função é utilizada quando você pega adiantamento com o financeiro. Clique em <strong>Iniciar</strong> e informe o valor recebido.
              </p>
            </div>

            <button
              onClick={handleOpenStartModal}
              className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold text-sm shadow-xl shadow-teal-600/30 flex items-center justify-center gap-2.5 transition-all active:scale-95 tracking-wide uppercase"
            >
              <Play size={20} /> INICIAR PRESTAÇÃO DE CONTAS
            </button>
          </div>
        ) : (
          <>
            {/* CARD DE DASHBOARD FINANCEIRO */}
            <div className="bg-gradient-to-br from-teal-800 via-teal-900 to-slate-900 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-36 h-36 bg-white/5 rounded-full -mr-10 -mt-10 pointer-events-none" />

              <div className="flex justify-between items-center mb-4">
                <span className="text-[11px] font-bold text-teal-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet size={14} /> Adiantamento Financeiro
                </span>
                <button
                  onClick={handleOpenStartModal}
                  className="text-[10px] bg-white/10 hover:bg-white/20 text-teal-100 px-2.5 py-1 rounded-full border border-white/10 font-medium transition-colors"
                >
                  Alterar Inicial
                </button>
              </div>

              {/* Valores Principais Grid */}
              <div className="grid grid-cols-3 gap-2 text-center bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10">
                <div>
                  <span className="text-[10px] text-teal-200 font-semibold block uppercase">Recebido</span>
                  <span className="text-sm font-black text-white">
                    R$ {initialAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="border-x border-white/10 px-1">
                  <span className="text-[10px] text-teal-200 font-semibold block uppercase">Gasto</span>
                  <span className="text-sm font-black text-rose-300">
                    R$ {totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-teal-200 font-semibold block uppercase">Saldo</span>
                  <span className={`text-sm font-black ${remainingBalance >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                    R$ {remainingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-teal-200/80 mt-3 pt-2 border-t border-white/10 space-y-1">
                <div className="flex justify-between items-center">
                  <span>Motorista: <strong className="text-white">{userName || 'Motorista'}</strong></span>
                  <span className="text-[10px] text-teal-300 font-medium">{expenses.length} lançamentos</span>
                </div>
                <div className="text-[10px] font-semibold">
                  {expenseSyncState === 'saved' ? 'Prestação salva no banco' :
                   expenseSyncState === 'login' ? 'Entre novamente para sincronizar as despesas' :
                   'Prestação pendente de sincronização'}
                </div>
                {destination && (
                  <div className="flex items-center gap-1 text-teal-200">
                    <MapPin size={12} className="text-teal-300 flex-shrink-0" />
                    <span>Destino: <strong className="text-white">{destination}</strong></span>
                  </div>
                )}
              </div>
            </div>

            {/* BOTÃO NOVO LANÇAMENTO */}
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="w-full py-4 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white rounded-2xl font-bold text-sm shadow-lg shadow-teal-600/20 flex items-center justify-center gap-2 transition-all"
              >
                <Plus size={20} /> ADICIONAR NOVA DESPESA
              </button>
            )}

            {/* FORMULÁRIO DE ADIÇÃO REESTRUTURADO */}
            {showForm && (
              <form onSubmit={handleAddExpense} className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4 animate-scale-up">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    {editingExpenseId ? <Pencil size={16} className="text-teal-600" /> : <Tag size={16} className="text-teal-600" />}
                    {editingExpenseId ? 'Editar Despesa' : 'Nova Despesa'}
                  </h3>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
                  >
                    Cancelar
                  </button>
                </div>

                {/* 1. DATA */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 mb-1.5 flex items-center gap-1 uppercase">
                    <CalendarIcon size={13} className="text-slate-400" /> 1. Data (DD/MM/AAAA)
                  </label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    required
                  />
                </div>

                {/* 2. FORNECEDOR */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 mb-1.5 flex items-center gap-1 uppercase">
                    <Store size={13} className="text-slate-400" /> 2. Fornecedor
                  </label>
                  <input
                    type="text"
                    placeholder="Digite o nome do fornecedor/estabelecimento..."
                    value={fornecedor}
                    onChange={(e) => setFornecedor(e.target.value)}
                    className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>

                {/* 3. PRODUTOS OU SERVIÇOS */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 mb-1.5 flex items-center gap-1 uppercase">
                    <Tag size={13} className="text-slate-400" /> 3. Produtos ou Serviços
                  </label>
                  <select
                    value={productService}
                    onChange={(e) => setProductService(e.target.value)}
                    className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  >
                    {PRODUCT_SERVICE_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                {/* CAMPO EXTRA CASO 'OUTROS' SEJA SELECIONADO */}
                {productService === 'Outros' && (
                  <div className="animate-fade-in pl-2 border-l-2 border-teal-500">
                    <label className="text-[11px] font-bold text-teal-700 mb-1.5 block uppercase">
                      Especifique o outro produto/serviço *
                    </label>
                    <input
                      type="text"
                      placeholder="Qual é o produto ou serviço?"
                      value={customProductService}
                      onChange={(e) => setCustomProductService(e.target.value)}
                      className="w-full h-12 px-4 bg-teal-50/50 border border-teal-200 rounded-xl text-slate-800 font-semibold text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                      required
                    />
                  </div>
                )}

                {/* 4. VALOR (R$) */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 mb-1.5 block uppercase">
                    4. Valor (R$) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-slate-400 font-bold text-sm">R$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0,00"
                      value={amount}
                      onChange={(e) => setAmount(formatCurrencyBR(e.target.value))}
                      className="w-full h-12 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold text-base focus:ring-2 focus:ring-teal-500 outline-none"
                      required
                    />
                  </div>
                </div>

                {/* 5. FOTO DO COMPROVANTE */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 mb-1.5 block uppercase">
                    5. Foto do Comprovante (Opcional)
                  </label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleSelectFileFromPC}
                    className="hidden"
                  />
                  <div
                    onClick={handleTakePhoto}
                    className={`w-full h-36 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative ${
                      isUploadingPhoto ? 'border-teal-500 bg-teal-50/50 cursor-wait' : photoUrl ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-300 bg-slate-50 hover:bg-slate-100/50'
                    }`}
                  >
                    {isUploadingPhoto ? (
                      <div className="flex flex-col items-center justify-center text-teal-600 space-y-2">
                        <div className="w-7 h-7 border-3 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs font-bold uppercase tracking-wide">Enviando foto ao Supabase...</span>
                      </div>
                    ) : photoUrl ? (
                      <div className="relative w-full h-full">
                        <img src={photoUrl} alt="Comprovante" className="w-full h-full object-cover" />
                        <div className="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                          <CheckCircle2 size={12} /> {photoUrl.startsWith('http') ? 'Supabase OK' : 'Pendente de envio'}
                        </div>
                      </div>
                    ) : (
                      <>
                        <Camera size={28} className="text-slate-400 mb-2" />
                        <span className="text-xs font-bold text-slate-400 uppercase text-center px-4">
                          {Capacitor.isNativePlatform() ? 'TIRAR FOTO DO COMPROVANTE' : 'SELECIONAR FOTO DO COMPROVANTE (ARQUIVO DO PC)'}
                        </span>
                      </>
                    )}
                  </div>

                  {uploadSuccessMsg && (
                    <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2 animate-fade-in shadow-sm">
                      <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                      <span>{uploadSuccessMsg}</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isUploadingPhoto || isSavingExpense}
                  className={`w-full py-3.5 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 uppercase tracking-wide ${
                    isUploadingPhoto || isSavingExpense ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {editingExpenseId ? <Save size={18} /> : <Plus size={18} />}
                  {editingExpenseId ? 'SALVAR ALTERAÇÕES' : 'CONFIRMAR ADIÇÃO'}
                </button>
              </form>
            )}

            {/* LISTA DE DESPESAS */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lançamentos da Rota</h3>

              {expenses.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                  <Receipt size={36} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-500">Nenhuma despesa adicionada ainda</p>
                  <p className="text-xs text-slate-400 mt-1">Clique em "Adicionar Nova Despesa" acima para lançar seus gastos.</p>
                </div>
              ) : (
                expenses.map((item) => (
                  <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {item.photoUrl ? (
                        <img src={item.photoUrl} alt="Foto" className="w-12 h-12 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
                          <Tag size={20} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-teal-600 uppercase tracking-wider">{item.category}</span>
                          <span className="text-[10px] text-slate-400 font-medium">• {item.date}</span>
                        </div>
                        {item.fornecedor ? (
                          <h4 className="text-xs font-bold text-slate-800 truncate">Fornecedor: {item.fornecedor}</h4>
                        ) : (
                          <h4 className="text-xs font-semibold text-slate-500 italic">Sem fornecedor informado</h4>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-800 mr-1">
                        R$ {parseFloat(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-colors"
                        title="Editar despesa"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteExpense(item.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        title="Excluir despesa"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* FOOTER COM BOTÃO FINALIZAR */}
      {isStarted && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.05)] z-[61]">
          <button
            onClick={handleFinishSession}
            disabled={isSavingExpense || isUploadingPhoto}
            className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-bold text-sm tracking-wide shadow-lg shadow-slate-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            <FileText size={20} /> FINALIZAR PRESTAÇÃO DE CONTAS
          </button>
        </div>
      )}
    </div>
  );
};
