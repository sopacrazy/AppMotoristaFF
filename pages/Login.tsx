import React, { useState, useEffect } from "react";
import { LogIn, Truck, DownloadCloud, RefreshCw, AlertTriangle } from "lucide-react";
import { getApiUrl, isNewerVersion } from "../src/apiConfig";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { CURRENT_APP_VERSION } from "../src/version";

interface LoginProps {
  onLoginSuccess: (driverId: string, driverPassword: string, isAdmin: boolean, trackingToken: string | null) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [driverId, setDriverId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [notification, setNotification] = useState<{
    show: boolean;
    type: "success" | "info" | "error";
    title: string;
    message: string;
  }>({ show: false, type: "info", title: "", message: "" });

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async (isManual = false) => {
    if (isManual) setIsChecking(true);
    try {
      const response = await fetch(getApiUrl("check-update"));
      if (response.ok) {
        const data = await response.json();
        const serverVersion = data.version;

        if (isNewerVersion(serverVersion, CURRENT_APP_VERSION)) {
          console.log(`Nova versão disponível: ${serverVersion}`);
          setUpdateAvailable(data);
        } else if (isManual) {
          setNotification({
            show: true,
            type: "success",
            title: "App Atualizado",
            message: `Você já está utilizando a versão mais recente (${CURRENT_APP_VERSION}) do FortFruit.`
          });
        }
      }
    } catch (err) {
      console.warn("Falha ao verificar atualizações:", err);
      if (isManual) {
        setNotification({
          show: true,
          type: "error",
          title: "Erro de Conexão",
          message: "Não foi possível verificar atualizações agora. Verifique sua conexão com a internet."
        });
      }
    } finally {
      if (isManual) setIsChecking(false);
    }
  };

  const performUpdate = async () => {
    if (!updateAvailable) return;

    setDownloadingUpdate(true);
    try {
      const version = await CapacitorUpdater.download({
        url: updateAvailable.url,
        version: updateAvailable.version,
      });

      await CapacitorUpdater.set(version);
    } catch (err) {
      console.error("Erro na atualização:", err);
      setNotification({
        show: true,
        type: "error",
        title: "Falha no Download",
        message: "Ocorreu um erro ao baixar a nova versão. Por favor, tente novamente em alguns instantes."
      });
      setDownloadingUpdate(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (downloadingUpdate) return;

    setError("");
    setLoading(true);
    try {
      const response = await fetch(getApiUrl("api/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: driverId, password: password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        onLoginSuccess(data.codMotorista, password, data.isAdmin || false, data.trackingToken || null);
      } else {
        setError(data.error || "Usuário ou senha inválidos.");
      }
    } catch (err) {
      console.error("Erro login:", err);
      if (!navigator.onLine) {
        setError("Você está sem internet 📶. Conecte-se para autenticar.");
      } else {
        setError("Erro ao conectar ao servidor backend.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (downloadingUpdate) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-brand-600 text-white p-6">
        <RefreshCw size={48} className="animate-spin mb-4" />
        <h2 className="text-xl font-bold">Atualizando App...</h2>
        <p className="text-sm opacity-80 mt-2">
          Por favor, aguarde o reinício automático.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 p-6 relative">
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
              className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold transition-all active:scale-95"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE UPDATE DISPONÍVEL */}
      {updateAvailable && (
        <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in shadow-2xl">
          <div className="bg-white rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3)] max-w-sm w-full text-center relative animate-scale-up border border-slate-100">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand-400 to-brand-600 rounded-t-full" />
            
            <div className="w-24 h-24 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ring-8 ring-brand-50/50">
              <DownloadCloud size={44} strokeWidth={2.5} className="animate-bounce" />
            </div>
            
            <h3 className="text-2xl font-black text-slate-800 mb-2">Novo FortFruit! 🚀</h3>
            <p className="text-slate-500 text-base leading-relaxed mb-8">
              Uma nova atualização (<span className="font-bold text-brand-600">{updateAvailable.version}</span>) está pronta para ser instalada.
              {updateAvailable.note && (
                <span className="block mt-3 p-3 bg-slate-50 rounded-xl text-xs text-slate-400 border border-slate-100 italic">
                   "{updateAvailable.note}"
                </span>
              )}
            </p>
            
            <div className="space-y-3">
              <button
                onClick={performUpdate}
                className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-black shadow-xl shadow-brand-500/40 transition-all active:scale-95 text-lg uppercase tracking-tight"
              >
                Instalar Agora
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

      <div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-2xl border border-slate-100">
        {/* Header/Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="p-4 bg-brand-600 rounded-full mb-3 shadow-lg shadow-brand-500/30">
            <Truck size={36} className="text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800">FortFruit</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-slate-500">
              Versão {CURRENT_APP_VERSION}
            </p>
            <button 
              onClick={() => checkForUpdates(true)}
              disabled={isChecking}
              className="p-1.5 rounded-full hover:bg-slate-100 text-brand-600 transition-colors disabled:opacity-50"
              title="Buscar atualizações"
            >
              <RefreshCw size={14} className={isChecking ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Formulário de Login (Original) */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              htmlFor="id"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              ID do Motorista
            </label>
            <input
              id="id"
              type="text"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-brand-500 focus:border-brand-500 transition-all"
              placeholder="Ex: Igo.Santos"
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Senha
            </label>
            <input
              id="password"
              type="password"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-brand-500 focus:border-brand-500 transition-all"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {error && (
            <div className="text-red-600 text-xs text-center bg-red-50 p-3 rounded-lg border border-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white rounded-xl font-bold text-base shadow-lg shadow-brand-500/30 hover:bg-brand-700 transition-all active:scale-[0.98] disabled:bg-slate-400 disabled:shadow-none"
            disabled={loading}
          >
            {loading ? (
              "Acessando..."
            ) : (
              <>
                <LogIn size={20} /> Entrar
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          Esqueceu a senha? Entre em contato com a administração.
        </p>
      </div>
    </div>
  );
};
