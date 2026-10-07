import React, { useState } from "react";
import {
  HashRouter,
  Routes,
  Route,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { Home, Package, Clock, User, DownloadCloud, RefreshCw, ClipboardCheck, AlertTriangle, ArrowRight, ClipboardList, Map } from "lucide-react";
import { Dashboard } from "./pages/Dashboard";
import { DeliveryList } from "./pages/DeliveryList";
import { Reports } from "./pages/Reports";
import { Traffic } from "./pages/Traffic"; // Nova página
import { History } from "./pages/History";
import { AdminMessages } from "./pages/AdminMessages";
import { Login } from "./pages/Login";
import { Checklist } from "./pages/Checklist";
import { DailyControl } from "./pages/DailyControl";
import { Despesas } from "./src/despesas";
import { MessageSquare } from "lucide-react";
import { CURRENT_DRIVER, MOCK_DELIVERIES } from "./constants";
import { mapDeliveriesArray } from "./src/services/deliveryMapper";
import { getApiUrl, isNewerVersion } from "./src/apiConfig";
import { AppRoute, DeliveryStatus, Delivery, DriverStats } from "./types";
// 🚨 IMPORT UPDATE PLUGIN
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { CURRENT_APP_VERSION } from "./src/version";
import { isOnline, onNetworkChange } from "./src/services/networkService";
import { isAndroidTrackingAvailable, startRouteTracking, stopRouteTracking, syncPendingTracking } from "./src/services/routeTracking";
import { syncPendingExpenseReports } from "./src/services/expenseSync";

const AppContent: React.FC = () => {
  const navigate = useNavigate();

  // 🚨 NOTIFICAR QUE O APP INICIOU COM SUCESSO (PARA O UPDATER NÃO DAR ROLLBACK)
  React.useEffect(() => {
    CapacitorUpdater.notifyAppReady();
  }, []);

  /* 🚨 ESTADOS COM PERSISTÊNCIA INICIAL (LOCALSTORAGE) */
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem("app_isLoggedIn") === "true";
  });

  // --- UPDATE LOGIC (GLOBAL) ---
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [notification, setNotification] = useState<{
    show: boolean;
    type: "success" | "info" | "error";
    title: string;
    message: string;
  }>({ show: false, type: "info", title: "", message: "" });

  // Verifica atualizações periodicamente
  const checkForUpdates = async (isManual = false) => {
    try {
      const response = await fetch(getApiUrl("check-update"));
      if (response.ok) {
        const data = await response.json();
        // Compara versões de forma robusta
        if (isNewerVersion(data.version, CURRENT_APP_VERSION)) {
          console.log(`Nova versão disponível: ${data.version}`);
          setUpdateAvailable(data);
        } else if (isManual) {
          setNotification({
            show: true,
            type: "success",
            title: "App Atualizado",
            message: `Você já está na versão mais recente (${CURRENT_APP_VERSION}).`
          });
        }
      }
    } catch (err) {
      if (isManual) {
        setNotification({
          show: true,
          type: "error",
          title: "Erro de Conexão",
          message: "Não foi possível verificar no momento. Verifique sua internet."
        });
      }
    }
  };

  // Redireciona para o Login para realizar o update
  const handleUpdateRedirect = () => {
    // Limpa sessão local
    setIsLoggedIn(false);
    setCodMotorista(null);
    setTrackingToken(null);
    setStats(null);
    setCodigoRota(null);
    localStorage.removeItem("app_isLoggedIn");
    localStorage.removeItem("app_codMotorista");
    localStorage.removeItem("app_trackingToken");
    localStorage.removeItem("app_stats");
    localStorage.removeItem("app_entregas");
    localStorage.removeItem("app_codigoRota");

    setUpdateAvailable(null); // Fecha modal local
    // Navegação para login ocorre automaticamente pois !isLoggedIn renderiza <Login /> no final do arquivo
  };

  React.useEffect(() => {
    checkForUpdates();
    // Checa a cada 5 minutos
    const interval = setInterval(() => checkForUpdates(), 1000 * 60 * 5);
    return () => clearInterval(interval);
  }, []);

  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem("app_isAdmin") === "true";
  });

  const [codMotorista, setCodMotorista] = useState<string | null>(() => {
    return localStorage.getItem("app_codMotorista");
  });
  const [trackingToken, setTrackingToken] = useState<string | null>(() => localStorage.getItem("app_trackingToken"));

  const [entregas, setEntregas] = useState<Delivery[]>(() => {
    const saved = localStorage.getItem("app_entregas");
    try {
      return saved ? JSON.parse(saved) : MOCK_DELIVERIES;
    } catch {
      return MOCK_DELIVERIES;
    }
  });

  const [stats, setStats] = useState<DriverStats | null>(() => {
    const saved = localStorage.getItem("app_stats");
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [jornadaIniciada, setJornadaIniciada] = useState(() => {
    return localStorage.getItem("app_jornadaIniciada") === "true";
  });
  const [jornadaEncerrada, setJornadaEncerrada] = useState(() => {
    return localStorage.getItem("app_jornadaEncerrada") === "true";
  });
  const [checklistConcluido, setChecklistConcluido] = useState(() => {
    // Tenta recuperar do storage primeiro para evitar flash
    return localStorage.getItem("app_checklistConcluido") === "true";
  });
  const [horaInicio, setHoraInicio] = useState<Date | null>(null);
  const [codigoRota, setCodigoRota] = useState<string | null>(() => {
    return localStorage.getItem("app_codigoRota") || null;
  });
  const [showChecklistAlert, setShowChecklistAlert] = useState(false);
  const [kmInicial, setKmInicial] = useState<number | null>(() => {
    const saved = localStorage.getItem("app_kmInicial");
    return saved ? parseInt(saved) : null;
  });
  const [kmFinal, setKmFinal] = useState<number | null>(() => {
    const saved = localStorage.getItem("app_kmFinal");
    return saved ? parseInt(saved) : null;
  });

  const handleRefreshData = async () => {
    if (!codMotorista && !isAdmin) return;
    if (!isOnline()) return; // sem internet: mantém dados do cache local

    try {
      // 1. STATS
      const statsResponse = await fetch(getApiUrl(`api/driver/stats/${codMotorista || 'ALL'}`));
      const statsData = statsResponse.ok ? await statsResponse.json() : CURRENT_DRIVER;

      if (statsResponse.ok && statsData.name) {
        setStats(statsData);
      } else {
        setStats((prev) => ({ ...(prev || CURRENT_DRIVER), ...statsData }));
      }

      // 1.2 STATUS DO CHECKLIST
      if (codMotorista) {
        try {
          const checkUrl = getApiUrl(`checklist/status/${codMotorista}`);
          const checkRes = await fetch(checkUrl);
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const isDone = !!checkData.done;
            setChecklistConcluido(isDone);
            localStorage.setItem("app_checklistConcluido", String(isDone));
          }
        } catch (e) {
          console.error("Erro checklist status:", e);
        }
      } else if (isAdmin || codMotorista === 'TESTE') {
        setChecklistConcluido(true); // Admin e usuário teste não precisam de checklist
        localStorage.setItem("app_checklistConcluido", "true");
      }

      // 1.5 JORNADA
      if (codMotorista) {
        try {
          const jornadaUrl = getApiUrl(`api/verificar_jornada/${codMotorista}`);
          const jornadaResponse = await fetch(jornadaUrl);

          if (jornadaResponse.ok) {
            const jornadaData = await jornadaResponse.json();

            if (jornadaData.jornadaIniciada) {
              setJornadaIniciada(true);
              setJornadaEncerrada(false);
              if (jornadaData.horaInicio) {
                setHoraInicio(new Date(jornadaData.horaInicio));
              }
              if (jornadaData.km) {
                setKmInicial(jornadaData.km);
              }
            } else {
              setJornadaIniciada(false);
              if (jornadaData.jornadaEncerrada) {
                setJornadaEncerrada(true);
                if (jornadaData.km) {
                  setKmFinal(jornadaData.km);
                }
              } else {
                setJornadaEncerrada(false);
              }
            }
          }
        } catch (errJ) {
          console.error("Erro ao verificar jornada:", errJ);
        }
      }

      // 2. ENTREGAS
      if (codMotorista) {
        const deliveriesResponse = await fetch(getApiUrl(`api/entregas/${codMotorista}`));

        if (deliveriesResponse.ok) {
          const deliveriesData = await deliveriesResponse.json();

          if (deliveriesData && deliveriesData.length > 0) {
            // Detecta a rota ativa: prefere a rota com entregas PENDENTES (nova), senão usa a primeira
            const pendingEntry = deliveriesData.find((d: any) =>
              d.ZH_STATUS === 'PENDENTE' || d.ZH_STATUS === 'EM ANDAMENTO'
            );
            const novoCodigo = pendingEntry
              ? pendingEntry.ZH_CODIGO
              : deliveriesData[0].ZH_CODIGO;

            if (novoCodigo && codigoRota && String(novoCodigo) !== String(codigoRota)) {
              // Verifica se a jornada anterior foi encerrada corretamente
              const jornadaEndInfo = JSON.parse(localStorage.getItem('app_jornada_encerrada_rota') || 'null');
              const jornadaAnteriorEncerrada = jornadaEndInfo?.codigoRota === String(codigoRota);

              // Verifica conclusão direto nos dados do banco, filtrando apenas a rota antiga
              const entregasRotaAtual = deliveriesData.filter(
                (d: any) => String(d.ZH_CODIGO) === String(codigoRota)
              );
              const statusFinais = ['CONCLUIDA', 'FINALIZADO', 'NÃO ENTREGUE', 'FALHA', 'FAILED'];
              const todasConcluidas = entregasRotaAtual.length === 0 || entregasRotaAtual.every(
                (d: any) => statusFinais.includes((d.ZH_STATUS || '').toUpperCase())
              );

              if (!jornadaAnteriorEncerrada && !todasConcluidas) {
                // Bloqueia a nova rota e avisa o motorista
                setNotification({
                  show: true,
                  type: "error",
                  title: "Encerre a Rota Atual!",
                  message: `Você ainda tem entregas pendentes na rota ${codigoRota}. Finalize as entregas para liberar a próxima rota.`,
                });
                return; // Não substitui as entregas atuais
              }

              // Rota anterior concluída — libera nova rota
              setNotification({
                show: true,
                type: "success",
                title: "Nova Rota Disponível!",
                message: `Um novo romaneio (${novoCodigo}) foi identificado e carregado automaticamente.`,
              });
            }

            if (novoCodigo) setCodigoRota(novoCodigo);
          }

          const mappedDeliveries = mapDeliveriesArray(deliveriesData);

          // Mescla com estado local: preserva COMPLETED local quando DB ainda está PENDING (sync pendente)
          setEntregas(prev => {
            const localById: Record<string, Delivery> = {};
            prev.forEach(d => { localById[d.id] = d; });
            return mappedDeliveries.map(d => {
              const local = localById[d.id];
              if (local?.status === DeliveryStatus.COMPLETED && d.status === DeliveryStatus.PENDING) {
                return local;
              }
              return d;
            });
          });

          const total = mappedDeliveries.length;
          const completed = mappedDeliveries.filter(
            (d) => d.status === DeliveryStatus.COMPLETED
          ).length;
          const efficiency = total > 0 ? Math.round((completed / total) * 100) : 0;

          setStats((prev) => ({
            ...(prev || CURRENT_DRIVER),
            totalDeliveries: total,
            completed: completed,
            efficiency: efficiency,
          }));
        }
      }
    } catch (error) {
      console.error("Erro ao atualizar dados:", error);
      throw error;
    }
  };

  React.useEffect(() => {
    localStorage.setItem("app_isLoggedIn", String(isLoggedIn));
    localStorage.setItem("app_isAdmin", String(isAdmin));
    if (codMotorista) localStorage.setItem("app_codMotorista", codMotorista);
    if (entregas) localStorage.setItem("app_entregas", JSON.stringify(entregas));
    if (stats) localStorage.setItem("app_stats", JSON.stringify(stats));
    localStorage.setItem("app_checklistConcluido", String(checklistConcluido));
    if (codigoRota) localStorage.setItem("app_codigoRota", codigoRota);
    if (kmInicial) localStorage.setItem("app_kmInicial", String(kmInicial));
    if (kmFinal) localStorage.setItem("app_kmFinal", String(kmFinal));
    localStorage.setItem("app_jornadaIniciada", String(jornadaIniciada));
    localStorage.setItem("app_jornadaEncerrada", String(jornadaEncerrada));
  }, [isLoggedIn, isAdmin, codMotorista, entregas, stats, checklistConcluido, codigoRota, kmInicial, kmFinal, jornadaIniciada, jornadaEncerrada]);

  React.useEffect(() => {
    if (isLoggedIn && (codMotorista || isAdmin)) {
      handleRefreshData();
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && isOnline()) {
          handleRefreshData();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      const handleWindowFocus = () => {
        if (isOnline()) handleRefreshData();
      };
      window.addEventListener('focus', handleWindowFocus);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleWindowFocus);
      };
    }
  }, [isLoggedIn, codMotorista, isAdmin]);

  React.useEffect(() => {
    if (!isLoggedIn || isAdmin || !codMotorista) return;
    if (!isAndroidTrackingAvailable()) {
      if ((window as any).Capacitor?.getPlatform() === 'android' && jornadaIniciada) {
        setNotification({ show: true, type: "error", title: "APK precisa atualizar", message: "Instale o APK com rastreamento para enviar a localização com o app fechado." });
      }
      return;
    }
    if (jornadaIniciada) {
      if (!trackingToken) {
        setNotification({ show: true, type: "error", title: "Rastreio inativo", message: "Entre novamente no app para ativar o rastreamento desta jornada." });
        return;
      }
      startRouteTracking(trackingToken, codMotorista, codigoRota ? String(codigoRota) : null)
        .then(() => syncPendingTracking())
        .catch((error) => {
          console.error("Rastreamento não iniciado:", error);
          setNotification({ show: true, type: "error", title: "Rastreio inativo", message: error?.message || "Ative a localização e permita o acesso para rastrear a rota." });
        });
    } else {
      stopRouteTracking(codMotorista)
        .then(() => syncPendingTracking())
        .catch((error) => console.error("Falha ao encerrar rastreio:", error));
    }
  }, [isLoggedIn, isAdmin, codMotorista, jornadaIniciada, codigoRota, trackingToken]);

  React.useEffect(() => {
    if (!isLoggedIn || isAdmin || !codMotorista) return;
    const syncExpenses = () => {
      void syncPendingExpenseReports(codMotorista).catch((error) => console.error("Falha ao sincronizar despesas:", error));
    };
    syncExpenses();
    window.addEventListener('online', syncExpenses);
    const interval = window.setInterval(syncExpenses, 60_000);
    return () => {
      window.removeEventListener('online', syncExpenses);
      window.clearInterval(interval);
    };
  }, [isLoggedIn, isAdmin, codMotorista]);

  const handleLoginSuccess = async (motoristaId: string | null | undefined, isAdminUser: boolean = false, token: string | null = null) => {
    setIsLoggedIn(true);
    setIsAdmin(isAdminUser);
    setTrackingToken(token);
    if (token) localStorage.setItem("app_trackingToken", token);
    else localStorage.removeItem("app_trackingToken");
    
    onNetworkChange((online) => {
      if (!online) return;
      import("./src/services/syncService").then(({ syncPendingUploads }) => {
        syncPendingUploads();
      });
      syncPendingArrivals();
      syncPendingJornadas();
    });

    let cleanId = "";
    if (typeof motoristaId === "string" && motoristaId.length > 0) {
      cleanId = motoristaId.split(":")[0].trim();
    } else if (!isAdminUser) {
      setStats(CURRENT_DRIVER);
      navigate("/");
      return;
    }

    setCodMotorista(cleanId);

    // Usuário teste não precisa de checklist
    if (cleanId === 'TESTE') {
      setChecklistConcluido(true);
      localStorage.setItem("app_checklistConcluido", "true");
    }

    import("./src/services/syncService").then(({ syncPendingUploads }) => {
      syncPendingUploads();
    });

    handleRefreshData();
    navigate("/");
  };

  const handleArrival = (id: string) => {
    setEntregas((prev) =>
      prev.map((d) => (d.id === id ? { ...d, arrivalTime: new Date().toISOString() } : d))
    );
  };

  const handleUpdateStatus = (id: string, newStatus: DeliveryStatus) => {
    let allFinished = false;

    setEntregas((prev) => {
      const updated = prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d));
      
      // Verifica se todas as entregas do romaneio atual foram concluídas ou falharam
      allFinished = updated.length > 0 && updated.every(
        (d) => d.status === DeliveryStatus.COMPLETED || d.status === DeliveryStatus.FAILED
      );

      // Se tudo foi finalizado, agendamos uma busca automática por novos romaneios
      if (allFinished && (newStatus === DeliveryStatus.COMPLETED || newStatus === DeliveryStatus.FAILED)) {
        console.log("Todas as entregas concluídas. Verificando novos romaneios em 3 segundos...");
        setTimeout(() => {
          handleRefreshData().catch(err => console.error("Erro no auto-refresh:", err));
        }, 3000); // 3 segundos para dar tempo do backend processar e do motorista ver o status finalizado
      }

      return updated;
    });

    if (newStatus === DeliveryStatus.COMPLETED) {
      setStats((prev) => {
        if (prev) return { ...prev, completed: (prev.completed || 0) + 1 };
        return CURRENT_DRIVER;
      });
    }
  };

  // Sincroniza chegadas registradas offline
  const syncPendingArrivals = async () => {
    const pending = JSON.parse(localStorage.getItem('offline_pending_arrivals') || '[]');
    if (!pending.length) return;

    const synced: string[] = [];
    for (const item of pending) {
      try {
        const res = await fetch(getApiUrl(`api/registrar_chegada/${item.numSeq}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok || res.status === 400) synced.push(item.numSeq); // 400 = já registrado, OK ignorar
      } catch { /* mantém na fila */ }
    }
    const remaining = pending.filter((i: any) => !synced.includes(i.numSeq));
    localStorage.setItem('offline_pending_arrivals', JSON.stringify(remaining));
  };

  // Sincroniza jornadas registradas offline
  const syncPendingJornadas = async () => {
    const pending = JSON.parse(localStorage.getItem('offline_pending_jornadas') || '[]');
    if (!pending.length) return;

    const synced: number[] = [];
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      try {
        const res = await fetch(getApiUrl('api/rota_logs'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        if (res.ok) synced.push(i);
      } catch { /* mantém na fila */ }
    }
    const remaining = pending.filter((_: any, i: number) => !synced.includes(i));
    localStorage.setItem('offline_pending_jornadas', JSON.stringify(remaining));
  };

  const toggleJornada = async (iniciar: boolean, km?: number) => {
    if (!codMotorista) return;

    if (iniciar && isAndroidTrackingAvailable() && !trackingToken) {
      setNotification({ show: true, type: "error", title: "Rastreio inativo", message: "Entre novamente no app para ativar o rastreamento desta jornada." });
    }

    const acao = iniciar ? "INICIO" : "ENCERRAR";
    const pendingLog = { motorista: codMotorista, acao, codigoRota, km, timestamp: new Date().toISOString() };
    if (!isOnline()) {
      const pending = JSON.parse(localStorage.getItem('offline_pending_jornadas') || '[]');
      pending.push(pendingLog);
      localStorage.setItem('offline_pending_jornadas', JSON.stringify(pending));
    } else {
      try {
        const response = await fetch(getApiUrl("api/rota_logs"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motorista: codMotorista, acao, codigoRota, km }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setNotification({ show: true, type: "error", title: "Jornada não registrada", message: data.error || "Não foi possível registrar a jornada." });
          return;
        }
      } catch (error) {
        console.error("Jornada salva offline:", error);
        const pending = JSON.parse(localStorage.getItem('offline_pending_jornadas') || '[]');
        pending.push(pendingLog);
        localStorage.setItem('offline_pending_jornadas', JSON.stringify(pending));
      }
    }

    setJornadaIniciada(iniciar);
    if (iniciar) {
      setHoraInicio(new Date());
      setKmInicial(km || null);
      setJornadaEncerrada(false);
    } else {
      setHoraInicio(null);
      setKmFinal(km || null);
      setJornadaEncerrada(true);
      // Marca que esta rota foi encerrada corretamente
      localStorage.setItem('app_jornada_encerrada_rota', JSON.stringify({
        codigoRota: codigoRota,
        data: new Date().toISOString(),
      }));
    }

  };

  const handleResetTestData = async () => {
    if (!window.confirm("Resetar todos os dados de teste?\n\nIsso vai:\n• Voltar as 4 entregas para PENDENTE\n• Apagar jornada de hoje\n• Apagar paradas de hoje\n• Apagar checklist de hoje")) return;

    try {
      // Garante que as entregas de teste existem (cria se necessário)
      await fetch(getApiUrl("setup-test-data"), { method: "POST" });

      const res = await fetch(getApiUrl("reset-test-data"), { method: "POST" });
      if (!res.ok) throw new Error("Erro no servidor");

      // Limpa estado local para começar do zero
      setJornadaIniciada(false);
      setJornadaEncerrada(false);
      setHoraInicio(null);
      setKmInicial(null);
      setKmFinal(null);
      setChecklistConcluido(true); // teste não usa checklist
      localStorage.removeItem("app_jornadaIniciada");
      localStorage.removeItem("app_jornadaEncerrada");
      localStorage.removeItem("app_kmInicial");
      localStorage.removeItem("app_kmFinal");
      localStorage.setItem("app_checklistConcluido", "true");
      localStorage.removeItem("app_jornada_encerrada_rota");
      localStorage.removeItem(`daily_logs_cache_${codMotorista}`);
      localStorage.removeItem(`daily_logs_queue_${codMotorista}`);
      localStorage.removeItem("offline_pending_arrivals");
      localStorage.removeItem("offline_pending_jornadas");
      // Limpa cache de entregas para forçar reload limpo do banco (sem mescla de estado antigo)
      setEntregas([]);
      localStorage.removeItem("app_entregas");

      await handleRefreshData();
      alert("✅ Dados resetados! Você pode iniciar um novo teste.");
    } catch (err) {
      alert("Erro ao resetar dados. Verifique a conexão com o servidor.");
    }
  };

  const handleLogout = () => {
    if (window.confirm("Deseja realmente sair do aplicativo?")) {
      setIsLoggedIn(false);
      setIsAdmin(false);
      setCodMotorista(null);
      setTrackingToken(null);
      setStats(null);
      setCodigoRota(null);
      localStorage.removeItem("app_isLoggedIn");
      localStorage.removeItem("app_isAdmin");
      localStorage.removeItem("app_codMotorista");
      localStorage.removeItem("app_trackingToken");
      localStorage.removeItem("app_stats");
      localStorage.removeItem("app_entregas");
      localStorage.removeItem("app_codigoRota");
      navigate("/login");
    }
  };

  const handleNavigate = (route: AppRoute) => {
    // 🚨 BLOQUEIO DE ENTREGAS (Checklist + Jornada/KM)
    if (route === AppRoute.DELIVERIES && !isAdmin && codMotorista !== 'TESTE') {
      if (!checklistConcluido) {
        setShowChecklistAlert(true);
        return;
      }
      if (!jornadaIniciada) {
        navigate("/deliveries"); // Deixa ir, mas a tela de entregas vai pedir a jornada
        return;
      }
    }

    switch (route) {
      case AppRoute.HOME: navigate("/"); break;
      case AppRoute.DELIVERIES: navigate("/deliveries"); break;
      case AppRoute.HISTORY: navigate("/history"); break;
      case AppRoute.REPORTS: navigate("/reports"); break;
      case AppRoute.TRAFFIC: navigate("/traffic"); break;
      case AppRoute.MESSAGES: navigate("/admin-messages"); break; // Rota para Admin
      case AppRoute.CHECKLIST:
        if (checklistConcluido) {
          navigate("/checklist"); // Deixa entrar, mas a tela vai mostrar "Já feito"
        } else {
          navigate("/checklist");
        }
        break;
      case AppRoute.DAILY_CONTROL: navigate("/daily-control"); break;
      case AppRoute.DESPESAS: navigate("/despesas"); break;
    }
  };

  if (!isLoggedIn) {
    return <Login onLoginSuccess={(id, _pw, isAdmin, token) => handleLoginSuccess(id, isAdmin, token)} />;
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm font-semibold">Carregando dados da rota...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* MODAL DE NOTIFICAÇÃO PREMIUM */}
      {notification.show && (
        <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 shadow-2xl max-w-xs w-full text-center animate-scale-up border border-slate-100">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 
              ${notification.type === 'success' ? 'bg-green-50 text-green-500' : 
                notification.type === 'error' ? 'bg-red-50 text-red-500' : 'bg-brand-50 text-brand-500'}`}>
              {notification.type === 'success' ? <RefreshCw size={32} /> : 
               notification.type === 'error' ? <AlertTriangle size={32} /> : <DownloadCloud size={32} />}
            </div>
            <h4 className="text-lg font-bold text-slate-800 mb-1">{notification.title}</h4>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              {notification.message}
            </p>
            <button
              onClick={() => setNotification({ ...notification, show: false })}
              className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold transition-all active:scale-95 shadow-lg"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* CHECKLIST ALERT MODAL */}
      {showChecklistAlert && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl animate-scale-up relative overflow-hidden border border-red-100">
            {/* Decorative Background */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 to-red-500" />

            <div className="w-20 h-20 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-100 ring-4 ring-white">
              <AlertTriangle size={40} strokeWidth={2.5} />
            </div>

            <h2 className="text-2xl font-black text-slate-800 mb-2">Atenção, Motorista!</h2>
            <p className="text-slate-500 mb-8 leading-relaxed font-medium">
              Para sua segurança e liberar as entregas, é <strong>obrigatório</strong> realizar o Checklist Diário do veículo.
            </p>

            <button
              onClick={() => { setShowChecklistAlert(false); navigate('/checklist'); }}
              className="w-full py-4 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white rounded-2xl font-bold tracking-wide shadow-xl shadow-slate-200 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              FAZER CHECKLIST AGORA <ArrowRight size={18} />
            </button>
            <button
              onClick={() => setShowChecklistAlert(false)}
              className="mt-4 text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {updateAvailable && (
        <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3)] max-w-sm w-full text-center relative animate-scale-up border border-slate-100">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand-400 to-brand-600" />
            
            <div className="w-24 h-24 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ring-8 ring-brand-50/50">
              <DownloadCloud size={44} strokeWidth={2.5} className="animate-bounce" />
            </div>
            
            <h3 className="text-2xl font-black text-slate-800 mb-2">Nova Versão! 🚀</h3>
            <p className="text-slate-500 text-base leading-relaxed mb-8">
              Uma nova atualização (<span className="font-bold text-brand-600">{updateAvailable?.version}</span>) está pronta para ser instalada.
              {updateAvailable?.note && (
                <span className="block mt-3 p-3 bg-slate-50 rounded-xl text-xs text-slate-400 border border-slate-100 italic">
                  "{updateAvailable.note}"
                </span>
              )}
            </p>
            
            <div className="space-y-3">
              <button
                onClick={handleUpdateRedirect}
                className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-black shadow-xl shadow-brand-500/40 transition-all active:scale-95 text-lg uppercase tracking-tight"
              >
                Atualizar Agora
              </button>
              <button
                onClick={() => setUpdateAvailable(null)}
                className="w-full py-2 text-slate-400 text-sm font-bold hover:text-slate-600 transition-colors"
              >
                Lembrar depois
              </button>
            </div>
          </div>
        </div>
      )}
      {/* BOTÃO DE RESET — VISÍVEL APENAS PARA O USUÁRIO TESTE */}
      {codMotorista === 'TESTE' && (
        <div className="fixed top-2 right-2 z-[500]">
          <button
            onClick={handleResetTestData}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold px-3 py-2 rounded-xl shadow-lg active:scale-95 transition-all"
          >
            🧪 Resetar Teste
          </button>
        </div>
      )}

      <div className="max-w-md mx-auto bg-slate-50 min-h-screen relative shadow-2xl overflow-hidden pb-20">
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                stats={stats || CURRENT_DRIVER}
                navigate={handleNavigate}
                onLogout={handleLogout}
                codMotorista={codMotorista}
                onRefresh={handleRefreshData}
                onCheckUpdate={() => checkForUpdates(true)}
                checklistConcluido={checklistConcluido}
                jornadaIniciada={jornadaIniciada}
                isAdmin={isAdmin}
              />
            }
          />
          <Route
            path="/deliveries"
            element={
              !checklistConcluido && !isAdmin && codMotorista !== 'TESTE' ? (
                <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center animate-fade-in">
                  <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6 shadow-sm">
                    <AlertTriangle size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Bloqueado</h2>
                  <p className="text-slate-500 mb-8 max-w-xs mx-auto">
                    Você precisa realizar o checklist diário obrigatório antes de acessar suas entregas.
                  </p>
                  <button
                    onClick={() => navigate('/checklist')}
                    className="w-full max-w-xs px-6 py-3.5 bg-slate-800 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2"
                  >
                    Ir para Checklist <ArrowRight size={18} />
                  </button>
                </div>
              ) : (
                <DeliveryList
                  deliveries={entregas}
                  updateStatus={handleUpdateStatus}
                  onArrival={handleArrival}
                  onRefresh={handleRefreshData}
                  jornadaIniciada={jornadaIniciada}
                  jornadaEncerrada={jornadaEncerrada}
                  horaInicio={horaInicio}
                  kmInicial={kmInicial}
                  kmFinal={kmFinal}
                  toggleJornada={toggleJornada}
                />
              )
            }
          />
          <Route path="/reports" element={<Reports codMotorista={codMotorista} />} />
          <Route path="/despesas" element={<Despesas key={codMotorista || 'guest'} onBack={() => navigate("/")} codMotorista={codMotorista} codigoRota={codigoRota} userName={stats?.name} />} />
          <Route path="/traffic" element={<Traffic />} />
          <Route path="/history" element={<History codMotorista={codMotorista} isAdmin={isAdmin} />} />
          <Route path="/admin-messages" element={<AdminMessages />} />
          <Route
            path="/checklist"
            element={
              checklistConcluido ? (
                <div className="fixed inset-0 bg-slate-50 z-[60] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                  <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-xl ring-8 ring-green-50">
                    <ClipboardCheck size={48} />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Tudo Pronto!</h2>
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full mb-6 border border-green-200">
                    CHECKLIST DIÁRIO CONCLUÍDO
                  </span>
                  <p className="text-slate-500 mb-8 max-w-xs mx-auto leading-relaxed">
                    Você já enviou o checklist de hoje. <br />Agora você pode seguir com suas entregas.
                  </p>
                  <div className="w-full max-w-xs space-y-3">
                    <button
                      onClick={() => navigate('/deliveries')}
                      className="w-full py-4 bg-slate-800 text-white rounded-2xl font-bold shadow-lg hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
                    >
                      <Package size={20} /> IR PARA ENTREGAS
                    </button>
                    <button
                      onClick={() => navigate('/')}
                      className="w-full py-4 text-slate-500 hover:text-slate-700 font-bold text-sm"
                    >
                      Voltar ao Início
                    </button>
                  </div>
                </div>
              ) : (
                <Checklist
                  onBack={() => {
                    handleRefreshData();
                    navigate('/');
                  }}
                  userName={stats?.name || 'Motorista'}
                  codMotorista={codMotorista}
                />
              )
            }
          />
          <Route path="/daily-control" element={<DailyControl codMotorista={codMotorista} routeId={codigoRota} />} />
        </Routes>

        {/* CUSTOM BOTTOM NAV */}
        <div className="fixed bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white via-white to-transparent pointer-events-none z-30" />
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around px-2 pb-2 h-20 z-40 rounded-t-3xl shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.05)]">
          <button
            onClick={() => handleNavigate(AppRoute.HOME)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all duration-300 ${window.location.hash === '#/' ? "text-brand-600 scale-105" : "text-slate-400 hover:text-slate-500"}`}
          >
            <Home size={24} strokeWidth={2.5} />
            <span className="text-[10px] font-medium">Início</span>
          </button>
          <button
            onClick={() => handleNavigate(AppRoute.DELIVERIES)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all duration-300 ${window.location.hash === '#/deliveries' ? "text-brand-600 scale-105" : "text-slate-400 hover:text-slate-500"}`}
          >
            <div className="relative">
              <Package size={24} strokeWidth={2.5} className={!checklistConcluido ? "opacity-50" : ""} />
              {!checklistConcluido && (
                <div className="absolute -top-1 -right-1 bg-red-500 w-3 h-3 rounded-full border-2 border-white" />
              )}
            </div>
            <span className="text-[10px] font-medium">Entregas</span>
          </button>
          <button
            onClick={() => handleNavigate(AppRoute.HISTORY)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all duration-300 ${window.location.hash === '#/history' ? "text-brand-600 scale-105" : "text-slate-400 hover:text-slate-500"}`}
          >
            <Clock size={24} strokeWidth={2.5} />
            <span className="text-[10px] font-medium">Histórico</span>
          </button>
          
          {isAdmin ? (
            <button
              onClick={() => handleNavigate(AppRoute.MESSAGES)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all duration-300 ${window.location.hash === '#/admin-messages' ? "text-brand-600 scale-105" : "text-slate-400 hover:text-slate-500"}`}
            >
              <MessageSquare size={24} strokeWidth={2.5} />
              <span className="text-[10px] font-medium">Mensagens</span>
            </button>
          ) : (
            <button
              onClick={() => handleNavigate(AppRoute.CHECKLIST)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all duration-300 ${window.location.hash === '#/checklist' ? "text-brand-600 scale-105" : "text-slate-400 hover:text-slate-500"}`}
            >
              <div className="relative">
                <ClipboardCheck size={24} strokeWidth={2.5} />
                {!checklistConcluido && (
                  <div className="absolute -top-1 -right-1 bg-brand-500 w-3 h-3 rounded-full border-2 border-white animate-pulse" />
                )}
              </div>
              <span className="text-[10px] font-medium">Checklist</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
};

export default App;
