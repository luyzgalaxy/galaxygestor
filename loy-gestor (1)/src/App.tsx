import React, { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/src/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogFooter } from "@/src/components/ui/dialog";
import { Switch } from "@/src/components/ui/switch";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Plus, Download, LogOut, Sun, Moon, RefreshCw, TrendingUp, Wallet, PieChart as LucidePieChart, Users, CheckCircle2, ArrowLeft, Clock, Calendar, Landmark, MessageCircle, Search, Trash2, Fingerprint, Camera, User, X, Bot, BotOff, ShieldCheck, AlertCircle, Send, Settings, Bell, Archive, Image as ImageIcon, Palette, Sparkles } from "lucide-react";

const MotionButton = motion(Button);

import { QRCodeCanvas } from "qrcode.react";
import { GoogleGenAI } from "@google/genai";
import Markdown from "react-markdown";
import { auth, db, isFirebaseConfigured } from "@/src/lib/firebase";
import { 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  createUserWithEmailAndPassword
} from "firebase/auth";
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy,
  getDoc
} from "firebase/firestore";

const Logo = ({ size = "md", className = "" }: { size?: "sm" | "md" | "lg", className?: string }) => {
  const sizes = {
    sm: "text-2xl",
    md: "text-4xl",
    lg: "text-7xl"
  };
  
  return (
    <div className={cn("flex items-center select-none", className)}>
      <div className="relative flex items-center group">
        <div className="absolute -inset-4 bg-primary-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        <motion.span 
          initial={{ x: -10, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          whileHover={{ scale: 1.1, rotate: -5 }}
          className={cn(
            "font-serif italic font-black text-primary-900 dark:text-primary-50 leading-none tracking-tighter cursor-default",
            sizes[size]
          )} style={{ fontFamily: "'Playfair Display', serif" }}>
          L
        </motion.span>
        <motion.span 
          initial={{ x: 10, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          whileHover={{ scale: 1.1, rotate: 5 }}
          className={cn(
            "font-serif italic font-black text-primary-600 dark:text-primary-400 leading-none tracking-tighter -ml-[0.15em] cursor-default",
            sizes[size]
          )} style={{ fontFamily: "'Playfair Display', serif" }}>
          G
        </motion.span>
        <motion.div 
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-primary-900 to-primary-400 dark:from-primary-50 dark:to-primary-500 rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
        />
      </div>
    </div>
  );
};

const ScrollToBottom = () => {
  const elementRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      elementRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 300);
    return () => clearTimeout(timer);
  }, []);
  return <div ref={elementRef} className="h-1" />;
};

interface ScheduleItem {
  installment: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  paid: boolean;
  overdue?: boolean;
  dueDate: string;
  paymentDate?: string;
}

interface Transaction {
  id: string;
  date: string;
  type: 'inflow' | 'outflow';
  amount: number;
  description: string;
  clientName?: string;
  loanId?: number;
  installment?: number;
}

interface Loan {
  id: number;
  client: string;
  whatsapp?: string;
  amount: number;
  rate: number;
  installments: number;
  installmentValue: number;
  schedule: ScheduleItem[];
  type: 'standard' | 'interest-only';
  notes?: string;
  photo?: string;
}

function calculateInstallments(amount: number, rate: number, installments: number, type: 'standard' | 'interest-only' = 'standard') {
  const monthlyRate = rate / 100;
  const schedule: ScheduleItem[] = [];
  const interestPerInstallment = amount * monthlyRate;

  if (type === 'interest-only') {
    for (let i = 1; i <= installments; i++) {
      const isLast = i === installments;
      const payment = isLast ? interestPerInstallment + amount : interestPerInstallment;
      const principal = isLast ? amount : 0;
      
      schedule.push({
        installment: i,
        payment: payment,
        principal: principal,
        interest: interestPerInstallment,
        balance: isLast ? 0 : amount,
        paid: false,
        dueDate: new Date(new Date().setMonth(new Date().getMonth() + i))
          .toISOString()
          .split("T")[0],
      });
    }
    
    const totalExpected = (interestPerInstallment * installments) + amount;
    return {
      installmentValue: totalExpected / installments,
      schedule
    };
  }

  const totalInterest = amount * monthlyRate * installments;
  const totalAmount = amount + totalInterest;
  const installmentValue = totalAmount / installments;
  
  let remainingPrincipal = amount;
  const principalPerInstallment = amount / installments;

  for (let i = 1; i <= installments; i++) {
    remainingPrincipal -= principalPerInstallment;
    schedule.push({
      installment: i,
      payment: installmentValue,
      principal: principalPerInstallment,
      interest: interestPerInstallment,
      balance: remainingPrincipal > 0 ? remainingPrincipal : 0,
      paid: false,
      dueDate: new Date(new Date().setMonth(new Date().getMonth() + i))
        .toISOString()
        .split("T")[0],
    });
  }

  return { installmentValue, schedule };
}

function getWhatsAppMessage(loan: Loan) {
  const paidInstallments = loan.schedule.filter(s => s.paid);
  const unpaidInstallments = loan.schedule.filter(s => !s.paid);
  
  const totalPaid = paidInstallments.reduce((acc, curr) => acc + curr.payment, 0);
  const totalRemaining = unpaidInstallments.reduce((acc, curr) => acc + curr.payment, 0);
  
  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
  };

  let message = `*L G* - *LOY GESTOR*\n`;
  message += `🏦 *EXTRATO DE EMPRÉSTIMO*\n\n`;
  message += `👤 *Cliente:* ${loan.client}\n`;
  message += `💰 *Valor Original:* R$ ${loan.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
  message += `📊 *Modalidade:* ${loan.type === 'interest-only' ? 'Juros' : 'Parcelado'}\n`;
  message += `📅 *Parcelas:* ${loan.installments} vezes\n\n`;
  
  message += `✅ *PARCELAS PAGAS (${paidInstallments.length}):*\n`;
  message += `\`PARC | VALOR      | DATA\`\n`;
  if (paidInstallments.length === 0) {
    message += `_Nenhuma parcela paga ainda._\n`;
  } else {
    paidInstallments.forEach(p => {
      const parc = p.installment.toString().padStart(2, '0');
      const valor = p.payment.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padEnd(10, ' ');
      const data = p.paymentDate ? formatDate(p.paymentDate) : '-';
      message += `✅ *${parc}ª* | R$ ${valor} | ${data}\n`;
    });
  }
  
  message += `\n⏳ *PARCELAS PENDENTES (${unpaidInstallments.length}):*\n`;
  message += `\`PARC | VALOR      | VENCIMENTO\`\n`;
  if (unpaidInstallments.length === 0) {
    message += `_Todas as parcelas foram pagas!_ 🎉\n`;
  } else {
    unpaidInstallments.forEach(p => {
      const isOverdue = new Date(p.dueDate + 'T12:00:00') < new Date(new Date().setHours(0,0,0,0));
      const parc = p.installment.toString().padStart(2, '0');
      const valor = p.payment.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padEnd(10, ' ');
      const data = formatDate(p.dueDate);
      message += `${isOverdue ? '🔴' : '⚪'} *${parc}ª* | R$ ${valor} | ${data}${isOverdue ? ' ⚠️' : ''}\n`;
    });
  }
  
  message += `\n───────────────────\n`;
  message += `💰 *Total Pago:* R$ ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
  message += `📉 *Saldo Devedor:* R$ ${totalRemaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
  message += `───────────────────\n\n`;
  message += `_Para mais informações, entre em contato conosco._`;
  
  return encodeURIComponent(message);
}

const ThemeSwitcher = ({ currentTheme, onThemeChange }: { currentTheme: string, onThemeChange: (t: string) => void }) => {
  const themes = [
    { name: "zinc", color: "bg-zinc-500" },
    { name: "indigo", color: "bg-indigo-500" },
    { name: "rose", color: "bg-rose-500" },
    { name: "emerald", color: "bg-emerald-500" },
    { name: "amber", color: "bg-amber-500" },
  ];

  return (
    <div className="flex items-center gap-1.5 p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full">
      {themes.map((t) => (
        <button
          key={t.name}
          onClick={() => onThemeChange(t.name)}
          className={cn(
            "w-5 h-5 rounded-full transition-all duration-200",
            t.color,
            currentTheme === t.name ? "ring-2 ring-offset-2 ring-zinc-900 dark:ring-zinc-100 scale-110" : "opacity-40 hover:opacity-100"
          )}
          title={t.name.charAt(0).toUpperCase() + t.name.slice(1)}
        />
      ))}
    </div>
  );
};

export default function LoanManagementApp() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("fintrack_dark_mode") === "true");
  const [theme, setTheme] = useState(() => localStorage.getItem("fintrack_theme") || "zinc");
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dashboardMode, setDashboardMode] = useState<'loaned' | 'profit' | 'expected' | 'paid'>('loaned');
  const [personalBotId, setPersonalBotId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Firebase Auth Listener
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthLoading(false);
      // Check if was in demo mode
      const savedDemo = localStorage.getItem("fintrack_demo_mode") === "true";
      if (savedDemo) {
        setIsDemoMode(true);
        setUser({ email: "demo@fintrack.io", displayName: "Demo User", uid: "demo-user" });
      }
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [isFirebaseConfigured]);

  // Firebase Data Sync
  useEffect(() => {
    if (!user || !isFirebaseConfigured) return;

    const docRef = doc(db, "appData", "shared"); // Shared data for all users
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.clients) setClients(data.clients);
        if (data.loans) setLoans(data.loans);
        if (data.archivedLoans) setArchivedLoans(data.archivedLoans);
        if (data.transactions) setTransactions(data.transactions);
        if (data.botLogs) setBotLogs(data.botLogs);
        if (data.botMessageTemplate) setBotMessageTemplate(data.botMessageTemplate);
        if (data.botStartHour !== undefined) setBotStartHour(data.botStartHour);
        if (data.botEndHour !== undefined) setBotEndHour(data.botEndHour);
        if (data.botFrequency !== undefined) setBotFrequency(data.botFrequency);
        if (data.botFrequencyUnit) setBotFrequencyUnit(data.botFrequencyUnit);
        if (data.botMinDelay !== undefined) setBotMinDelay(data.botMinDelay);
        if (data.botOperatingDays) setBotOperatingDays(data.botOperatingDays);
        if (data.isWhatsAppSynced !== undefined) setIsWhatsAppSynced(data.isWhatsAppSynced);
        if (data.appBackground) setAppBackground(data.appBackground);
        if (data.appBgColor) setAppBgColor(data.appBgColor);
        if (data.personalBotId) setPersonalBotId(data.personalBotId);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const saveToCloud = async (newData: any) => {
    // Always save to local storage as backup
    localStorage.setItem("loanAppData", JSON.stringify({
      ...initialData,
      ...newData,
      clients: newData.clients || clients,
      loans: newData.loans || loans,
      archivedLoans: newData.archivedLoans || archivedLoans,
      transactions: newData.transactions || transactions,
      botLogs: newData.botLogs || botLogs
    }));

    if (!user || !isFirebaseConfigured || isDemoMode) return;
    try {
      const docRef = doc(db, "appData", "shared");
      await setDoc(docRef, newData, { merge: true });
    } catch (e) {
      console.error("Error saving to cloud:", e);
    }
  };

  // Initial Data (still used for some defaults)
  const initialData = useMemo(() => {
    const saved = localStorage.getItem("loanAppData");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved data", e);
      }
    }
    return {};
  }, []);

  const [clients, setClients] = useState<string[]>(initialData.clients || []);
  const [loans, setLoans] = useState<Loan[]>(initialData.loans || []);
  const [archivedLoans, setArchivedLoans] = useState<Loan[]>(initialData.archivedLoans || []);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<'dashboard' | 'financeiro' | 'cobrancas' | 'arquivados'>('dashboard');
  const [botActive, setBotActive] = useState(false);
  const [botLogs, setBotLogs] = useState<{id: string, message: string, time: string, type: 'info' | 'success' | 'warning'}[]>(initialData.botLogs || []);
  const [botMessageTemplate, setBotMessageTemplate] = useState(initialData.botMessageTemplate || "🔔 *LEMBRETE DE PAGAMENTO* 🔔\n\nOlá, *{cliente}*!\n\nIdentificamos que você possui *{parcelas}* parcela(s) pendente(s) no valor total de *R$ {valor}*.\n\n📅 *Vencimento:* {vencimento}\n\nPor favor, entre em contato para regularizar sua situação.\n\nAtenciosamente,\n*{empresa}*");
  const [botStartHour, setBotStartHour] = useState(initialData.botStartHour !== undefined ? initialData.botStartHour : 8);
  const [botEndHour, setBotEndHour] = useState(initialData.botEndHour !== undefined ? initialData.botEndHour : 18);
  const [botFrequency, setBotFrequency] = useState(initialData.botFrequency !== undefined ? initialData.botFrequency : 15); // seconds
  const [botFrequencyUnit, setBotFrequencyUnit] = useState<'seconds' | 'days'>(initialData.botFrequencyUnit || 'seconds');
  const [botMinDelay, setBotMinDelay] = useState(initialData.botMinDelay !== undefined ? initialData.botMinDelay : 1); // days
  const [botOperatingDays, setBotOperatingDays] = useState<number[]>(initialData.botOperatingDays || [1, 2, 3, 4, 5]); // Mon-Fri
  const [isWhatsAppSynced, setIsWhatsAppSynced] = useState(initialData.isWhatsAppSynced || false);
  const [transactions, setTransactions] = useState<Transaction[]>(initialData.transactions || []);
  const [appBackground, setAppBackground] = useState<string>(initialData.appBackground || "");
  const [appBgColor, setAppBgColor] = useState<string>(initialData.appBgColor || "");
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncMethod, setSyncMethod] = useState<'qr' | 'code' | 'direct'>('qr');
  const [phoneNumber, setPhoneNumber] = useState("");
  const [qrValue, setQrValue] = useState(`whatsapp-sync-${Math.random().toString(36).substr(2, 9)}`);
  const [pairingCode, setPairingCode] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appNotifications, setAppNotifications] = useState<{id: string, title: string, message: string, type: 'info' | 'success' | 'warning'}[]>([]);
  const notifiedTodayRef = useRef<string | null>(null);
  const [aiInsights, setAiInsights] = useState<string>("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const generateAIInsights = async () => {
    setIsGeneratingAI(true);
    try {
      // Compatibility with both AI Studio (process.env) and Netlify (import.meta.env)
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        addNotification("Erro de Configuração", "Chave API do Gemini não encontrada.", "warning");
        setIsGeneratingAI(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const financialData = {
        totalLoaned,
        totalExpected,
        totalProfit,
        paidAmount,
        paidProfit,
        overdueCount: loans.filter(loan => loan.schedule.some(s => !s.paid && new Date(s.dueDate) < new Date())).length,
        activeLoans: loans.length,
        archivedLoans: archivedLoans.length
      };

      const prompt = `Como um analista financeiro sênior, analise os seguintes dados da minha carteira de empréstimos e forneça insights estratégicos, riscos e recomendações em português:
      
      - Total Emprestado: R$ ${financialData.totalLoaned.toLocaleString('pt-BR')}
      - Retorno Esperado: R$ ${financialData.totalExpected.toLocaleString('pt-BR')}
      - Lucro Projetado: R$ ${financialData.totalProfit.toLocaleString('pt-BR')}
      - Valor Já Recebido: R$ ${financialData.paidAmount.toLocaleString('pt-BR')}
      - Lucro Já Realizado: R$ ${financialData.paidProfit.toLocaleString('pt-BR')}
      - Clientes com Atraso: ${financialData.overdueCount}
      - Empréstimos Ativos: ${financialData.activeLoans}
      - Registros Arquivados: ${financialData.archivedLoans}
      
      Por favor, formate a resposta em Markdown com títulos claros e emojis.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setAiInsights(response.text || "Não foi possível gerar insights no momento.");
      addNotification("IA Concluída", "Insights financeiros gerados com sucesso!", "success");
    } catch (error) {
      console.error("AI Error:", error);
      addNotification("Erro na IA", "Falha ao conectar com o serviço de inteligência artificial.", "warning");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const playNotificationSound = () => {
    const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
    audio.play().catch(e => console.log("Audio play failed:", e));
  };

  const addNotification = (title: string, message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setAppNotifications(prev => [{id, title, message, type}, ...prev]);
    playNotificationSound();
    setTimeout(() => {
      setAppNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [adminPassword, setAdminPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isBiometricActive, setIsBiometricActive] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const botTemplateRef = useRef<HTMLTextAreaElement>(null);

  const notifications = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const alerts: { id: string, type: 'due' | 'overdue', client: string, amount: number, date: string, loanId: number }[] = [];
    
    loans.forEach(loan => {
      loan.schedule.forEach(item => {
        if (!item.paid) {
          if (item.dueDate === today) {
            alerts.push({
              id: `${loan.id}-${item.installment}`,
              type: 'due',
              client: loan.client,
              amount: item.payment,
              date: item.dueDate,
              loanId: loan.id
            });
          } else if (item.dueDate < today) {
            alerts.push({
              id: `${loan.id}-${item.installment}`,
              type: 'overdue',
              client: loan.client,
              amount: item.payment,
              date: item.dueDate,
              loanId: loan.id
            });
          }
        }
      });
    });
    
    return alerts.sort((a, b) => a.date.localeCompare(b.date));
  }, [loans]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, startDate, endDate]);

  const exportTransactions = () => {
    const headers = ["Data", "Tipo", "Valor", "Descrição", "Cliente"];
    const rows = filteredTransactions.map(t => [
      new Date(t.date).toLocaleDateString('pt-BR'),
      t.type === 'inflow' ? 'Entrada' : 'Saída',
      t.amount.toFixed(2),
      t.description,
      t.clientName || '-'
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `extrato_financeiro_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Refresh QR code and pairing code every 30 seconds
  useEffect(() => {
    if (isWhatsAppSynced || isConnecting || syncMethod === 'code') return;
    const interval = setInterval(() => {
      setQrValue(`whatsapp-sync-${Math.random().toString(36).substr(2, 9)}`);
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      setPairingCode(code);
    }, 30000);
    return () => clearInterval(interval);
  }, [isWhatsAppSynced, isConnecting, syncMethod]);
  const [form, setForm] = useState({ name: "", whatsapp: "", amount: "", rate: "", installments: "0", type: 'standard' as 'standard' | 'interest-only', notes: "", photo: "" });

  // Sync dark mode with document element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
      document.body.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
      document.body.classList.remove("dark");
    }
    localStorage.setItem("fintrack_dark_mode", darkMode.toString());
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("fintrack_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (loans.length > 0 && transactions.length === 0) {
      const historicalTransactions: Transaction[] = [];
      loans.forEach(loan => {
        const disbursementDate = new Date(loan.id).toISOString().split('T')[0];
        historicalTransactions.push({
          id: `out-${loan.id}`,
          date: disbursementDate,
          type: 'outflow',
          amount: loan.amount,
          description: `Empréstimo concedido (Histórico)`,
          clientName: loan.client,
          loanId: loan.id
        });

        loan.schedule.forEach(item => {
          if (item.paid) {
            historicalTransactions.push({
              id: `in-${loan.id}-${item.installment}`,
              date: item.paymentDate || item.dueDate,
              type: 'inflow',
              amount: item.payment,
              description: `Recebimento Parcela ${item.installment} (Histórico)`,
              clientName: loan.client,
              loanId: loan.id,
              installment: item.installment
            });
          }
        });
      });
      if (historicalTransactions.length > 0) {
        setTransactions(historicalTransactions);
      }
    }
  }, [loans, transactions.length]);

  useEffect(() => {
    if (!user && !isDemoMode) return;
    saveToCloud({ 
      clients, 
      loans, 
      archivedLoans,
      appBackground,
      appBgColor,
      botMessageTemplate, 
      botStartHour, 
      botEndHour,
      botFrequency,
      botFrequencyUnit,
      botMinDelay,
      botOperatingDays,
      isWhatsAppSynced,
      botLogs,
      transactions,
      personalBotId
    });
  }, [clients, loans, archivedLoans, appBackground, appBgColor, botMessageTemplate, botStartHour, botEndHour, botFrequency, botFrequencyUnit, botMinDelay, botOperatingDays, isWhatsAppSynced, botLogs, transactions, personalBotId, user]);

  const handleLogin = async () => {
    setLoginError("");
    
    // Hardcoded Admin Login Bypass
    if (email === "loithebest36@gmail.com" && password === "241889") {
      setIsDemoMode(true);
      setUser({ 
        email: "loithebest36@gmail.com", 
        displayName: "Administrador Geral", 
        uid: "super-admin",
        role: "admin" 
      });
      localStorage.setItem("fintrack_demo_mode", "true");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      console.error("Login error:", e);
      if (e.code === 'auth/user-not-found') {
        setLoginError("Usuário não encontrado. Você já criou sua conta?");
      } else if (e.code === 'auth/wrong-password') {
        setLoginError("Senha incorreta. Tente novamente.");
      } else if (e.code === 'auth/invalid-email') {
        setLoginError("E-mail inválido.");
      } else if (e.code === 'auth/too-many-requests') {
        setLoginError("Muitas tentativas. Tente novamente mais tarde.");
      } else {
        setLoginError("Erro ao fazer login: " + (e.message || "Verifique suas credenciais."));
      }
    }
  };

  const handleRegister = async () => {
    setLoginError("");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setIsRegistering(false);
      addNotification("Sucesso", "Usuário criado com sucesso!", "success");
    } catch (e: any) {
      setLoginError("Erro ao criar usuário: " + e.message);
    }
  };

  const logout = () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      setUser(null);
      localStorage.removeItem("fintrack_demo_mode");
    } else {
      signOut(auth);
    }
  };

  const handleDemoLogin = () => {
    setIsDemoMode(true);
    setUser({ 
      email: "admin@fintrack.io", 
      displayName: "Administrador", 
      uid: "admin-user",
      role: "admin" 
    });
    localStorage.setItem("fintrack_demo_mode", "true");
  };

  const filteredLoans = useMemo(() => {
    return loans.filter(loan => 
      loan.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (loan.whatsapp && loan.whatsapp.includes(searchTerm))
    );
  }, [loans, searchTerm]);

  const addLoan = () => {
    if (!form.name || !form.amount || !form.rate || !form.installments) return;

    const { installmentValue, schedule } = calculateInstallments(
      parseFloat(form.amount),
      parseFloat(form.rate),
      parseInt(form.installments),
      form.type
    );

    const newLoan: Loan = {
      id: Date.now(),
      client: form.name,
      whatsapp: form.whatsapp,
      amount: parseFloat(form.amount),
      rate: parseFloat(form.rate),
      installments: parseInt(form.installments),
      installmentValue,
      schedule,
      type: form.type,
      notes: form.notes,
      photo: form.photo
    };

    const newTransaction: Transaction = {
      id: `out-${newLoan.id}`,
      date: new Date().toISOString().split('T')[0],
      type: 'outflow',
      amount: newLoan.amount,
      description: `Empréstimo concedido`,
      clientName: newLoan.client,
      loanId: newLoan.id
    };

    setLoans([...loans, newLoan]);
    setTransactions(prev => [newTransaction, ...prev]);
    if (!clients.includes(form.name)) setClients([...clients, form.name]);
    setForm({ name: "", whatsapp: "", amount: "", rate: "", installments: "0", type: 'standard', notes: "", photo: "" });
  };

  const insertTag = (tag: string) => {
    if (!botTemplateRef.current) return;
    const textarea = botTemplateRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = botMessageTemplate;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    setBotMessageTemplate(before + tag + after);
    
    // Set focus back to textarea after state update
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const togglePayment = (loanId: number, installmentNumber: number) => {
    const today = new Date().toISOString().split('T')[0];
    let transactionToAdd: Transaction | null = null;
    let transactionToRemoveId: string | null = null;

    setLoans(loans.map(loan => {
      if (loan.id === loanId) {
        const updatedSchedule = loan.schedule.map(row => {
          if (row.installment === installmentNumber) {
            const newPaidStatus = !row.paid;
            if (newPaidStatus) {
              transactionToAdd = {
                id: `in-${loanId}-${installmentNumber}`,
                date: today,
                type: 'inflow',
                amount: row.payment,
                description: `Recebimento Parcela ${installmentNumber}`,
                clientName: loan.client,
                loanId: loanId,
                installment: installmentNumber
              };
              return { ...row, paid: true, overdue: false, paymentDate: today };
            } else {
              transactionToRemoveId = `in-${loanId}-${installmentNumber}`;
              return { ...row, paid: false, overdue: false, paymentDate: undefined };
            }
          }
          return row;
        });
        return { ...loan, schedule: updatedSchedule };
      }
      return loan;
    }));

    if (transactionToAdd) {
      setTransactions(prev => [transactionToAdd!, ...prev]);
    } else if (transactionToRemoveId) {
      setTransactions(prev => prev.filter(t => t.id !== transactionToRemoveId));
    }
  };

  const toggleOverdue = (loanId: number, installmentNumber: number) => {
    setLoans(loans.map(loan => {
      if (loan.id === loanId) {
        return {
          ...loan,
          schedule: loan.schedule.map(row =>
            row.installment === installmentNumber ? { ...row, overdue: !row.overdue, paid: false } : row
          )
        };
      }
      return loan;
    }));
  };

  const updateDueDate = (loanId: number, installmentNumber: number, newDate: string) => {
    if (!newDate) {
      setLoans(prev => prev.map(loan => {
        if (loan.id === loanId) {
          return {
            ...loan,
            schedule: loan.schedule.map(row =>
              row.installment === installmentNumber ? { ...row, dueDate: "" } : row
            )
          };
        }
        return loan;
      }));
      return;
    }

    const baseDate = new Date(newDate + 'T12:00:00');
    if (isNaN(baseDate.getTime())) {
      setLoans(prev => prev.map(loan => {
        if (loan.id === loanId) {
          return {
            ...loan,
            schedule: loan.schedule.map(row =>
              row.installment === installmentNumber ? { ...row, dueDate: newDate } : row
            )
          };
        }
        return loan;
      }));
      return;
    }

    setLoans(prev => prev.map(loan => {
      if (loan.id === loanId) {
        return {
          ...loan,
          schedule: loan.schedule.map(row => {
            if (row.installment === installmentNumber) {
              return { ...row, dueDate: newDate };
            } else if (row.installment > installmentNumber) {
              const diff = row.installment - installmentNumber;
              const nextDate = new Date(baseDate);
              nextDate.setMonth(baseDate.getMonth() + diff);
              return { ...row, dueDate: nextDate.toISOString().split("T")[0] };
            }
            return row;
          })
        };
      }
      return loan;
    }));
  };

  const updateLoan = (loanId: number, updates: Partial<Loan>) => {
    setLoans(prev => prev.map(loan => {
      if (loan.id === loanId) {
        if (updates.client && loan.client !== updates.client) {
          setClients(prevClients => {
            const newClients = prevClients.map(c => c === loan.client ? updates.client! : c);
            if (!newClients.includes(updates.client!)) {
              newClients.push(updates.client!);
            }
            return Array.from(new Set(newClients));
          });
        }
        return { ...loan, ...updates };
      }
      return loan;
    }));
  };

  const recalculateLoan = (loanId: number, amount: number, rate: number, installments: number, type: 'standard' | 'interest-only') => {
    const { installmentValue, schedule } = calculateInstallments(amount, rate, installments, type);
    setLoans(prev => prev.map(loan => {
      if (loan.id === loanId) {
        return {
          ...loan,
          amount,
          rate,
          installments,
          installmentValue,
          schedule,
          type
        };
      }
      return loan;
    }));
  };

  const updateInstallmentAmount = (loanId: number, installmentNumber: number, newAmount: number) => {
    setLoans(prev => prev.map(loan => {
      if (loan.id === loanId) {
        return {
          ...loan,
          schedule: loan.schedule.map(row => 
            row.installment === installmentNumber ? { ...row, payment: newAmount } : row
          )
        };
      }
      return loan;
    }));
  };

  const archiveLoan = (loanId: number) => {
    const loanToArchive = loans.find(l => l.id === loanId);
    if (loanToArchive) {
      setArchivedLoans(prev => [...prev, loanToArchive]);
      setLoans(prev => prev.filter(l => l.id !== loanId));
    }
  };

  const unarchiveLoan = (loanId: number) => {
    const loanToUnarchive = archivedLoans.find(l => l.id === loanId);
    if (loanToUnarchive) {
      setLoans(prev => [...prev, loanToUnarchive]);
      setArchivedLoans(prev => prev.filter(l => l.id !== loanId));
    }
  };

  const deleteLoan = (loanId: number) => {
    setLoans(prev => prev.filter(loan => loan.id !== loanId));
    setTransactions(prev => prev.filter(t => t.loanId !== loanId));
  };

  // Bot Simulation Effect
  useEffect(() => {
    if (!botActive) return;
    if (!isWhatsAppSynced) {
      const newLog = {
        id: Math.random().toString(36).substr(2, 9),
        message: "Erro: WhatsApp não sincronizado. O bot não pode enviar mensagens.",
        time: new Date().toLocaleTimeString('pt-BR'),
        type: 'warning' as const
      };
      setBotLogs(prev => [newLog, ...prev].slice(0, 50));
      setBotActive(false);
      return;
    }

    const intervalTime = botFrequencyUnit === 'seconds' ? botFrequency * 1000 : botFrequency * 24 * 60 * 60 * 1000;
    
    const interval = setInterval(() => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentDay = now.getDay();

      // Check operating days
      if (!botOperatingDays.includes(currentDay)) {
        return;
      }

      // Check operating hours
      if (currentHour < botStartHour || currentHour >= botEndHour) {
        return;
      }

      const overdueLoans = loans.filter(loan => 
        loan.schedule.some(s => {
          if (s.paid) return false;
          const dueDate = new Date(s.dueDate);
          const diffTime = Math.abs(now.getTime() - dueDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return dueDate < now && diffDays >= botMinDelay;
        })
      );

      if (overdueLoans.length > 0) {
        const randomLoan = overdueLoans[Math.floor(Math.random() * overdueLoans.length)];
        const overdueInstallments = randomLoan.schedule.filter(s => {
          if (s.paid) return false;
          const dueDate = new Date(s.dueDate);
          const diffTime = Math.abs(now.getTime() - dueDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return dueDate < now && diffDays >= botMinDelay;
        });
        const totalOverdue = overdueInstallments.reduce((acc, curr) => acc + curr.payment, 0);
        
        const sortedOverdue = [...overdueInstallments].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        const oldestOverdue = sortedOverdue[0];
        
        const formattedMessage = botMessageTemplate
          .replace(/{cliente}/g, randomLoan.client)
          .replace(/{parcelas}/g, overdueInstallments.length.toString())
          .replace(/{valor}/g, totalOverdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
          .replace(/{vencimento}/g, oldestOverdue ? new Date(oldestOverdue.dueDate).toLocaleDateString('pt-BR') : '')
          .replace(/{empresa}/g, "Loy Gestor");

        const newLog = {
          id: Math.random().toString(36).substr(2, 9),
          message: `Mensagem enviada para ${randomLoan.client}: "${formattedMessage.substring(0, 40)}..."`,
          time: now.toLocaleTimeString('pt-BR'),
          type: 'success' as const
        };
        setBotLogs(prev => [newLog, ...prev].slice(0, 50));
        
        // Trigger visual and sound notification
        addNotification("Mensagem Enviada", `Lembrete enviado para ${randomLoan.client}`, "success");
      } else {
        const newLog = {
          id: Math.random().toString(36).substr(2, 9),
          message: "Varredura concluída: Nenhum novo atraso crítico detectado.",
          time: now.toLocaleTimeString('pt-BR'),
          type: 'info' as const
        };
        setBotLogs(prev => [newLog, ...prev].slice(0, 50));
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [botActive, loans, botMessageTemplate, botStartHour, botEndHour, botFrequency, botFrequencyUnit, botMinDelay, botOperatingDays, isWhatsAppSynced]);

  const totalLoaned = useMemo(() => loans.reduce((acc, loan) => acc + loan.amount, 0), [loans]);
  const totalExpected = useMemo(() => loans.reduce((acc, loan) => acc + loan.installmentValue * loan.installments, 0), [loans]);
  const totalProfit = totalExpected - totalLoaned;

  const upcomingPayments = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    const list: { client: string; loanId: number; installment: number; dueDate: string; amount: number }[] = [];

    loans.forEach(loan => {
      loan.schedule.forEach(row => {
        const dueDate = new Date(row.dueDate);
        if (!row.paid && dueDate <= nextWeek) {
          list.push({
            client: loan.client,
            loanId: loan.id,
            installment: row.installment,
            dueDate: row.dueDate,
            amount: row.payment
          });
        }
      });
    });

    return list.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [loans]);

  const paidAmount = useMemo(() => 
    loans.flatMap(l => l.schedule).filter(s => s.paid).reduce((a, b) => a + b.payment, 0), 
  [loans]);

  const paidProfit = useMemo(() => 
    loans.flatMap(l => l.schedule).filter(s => s.paid).reduce((a, b) => a + b.interest, 0), 
  [loans]);

  // Due date reminder notification effect
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (notifiedTodayRef.current === today) return;

    const dueToday = loans.filter(loan => 
      loan.schedule.some(s => !s.paid && s.dueDate === today)
    );

    if (dueToday.length > 0) {
      addNotification(
        "Lembrete de Vencimento", 
        `Você tem ${dueToday.length} cliente(s) com parcelas vencendo hoje!`, 
        "warning"
      );
      notifiedTodayRef.current = today;
    }
  }, [loans]);

  const generateReport = () => {
    const totalExpectedVal = loans.reduce((acc, loan) => acc + (loan.installmentValue * loan.installments), 0);
    const paidAmountVal = loans.reduce((acc, loan) => 
      acc + loan.schedule.filter(s => s.paid).reduce((sum, s) => sum + s.payment, 0), 0
    );
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Por favor, permita popups para gerar o relatório.");
      return;
    }
    
    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório Financeiro - Loy Gestor</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
          body { font-family: 'Inter', sans-serif; padding: 40px; color: #18181b; line-height: 1.5; background: white; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e4e4e7; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { font-weight: 900; font-size: 24px; letter-spacing: -1px; }
          .date { color: #71717a; font-size: 14px; }
          h1 { font-size: 28px; font-weight: 900; margin: 0; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 40px; }
          .card { border: 1px solid #e4e4e7; padding: 20px; border-radius: 12px; background: #fafafa; }
          .card h3 { margin: 0; font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 1px; }
          .card p { margin: 8px 0 0; font-size: 20px; font-weight: 700; color: #18181b; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
          th { background: #f4f4f5; font-weight: 700; text-align: left; padding: 12px; border-bottom: 2px solid #e4e4e7; }
          td { padding: 12px; border-bottom: 1px solid #e4e4e7; }
          .footer { margin-top: 50px; text-align: center; color: #a1a1aa; font-size: 12px; }
          @media print {
            body { padding: 20px; }
            .card { background: white !important; border: 1px solid #eee !important; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">LOY GESTOR</div>
          <div class="date">Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
        </div>
        <h1>Relatório de Carteira Ativa</h1>
        <div class="summary">
          <div class="card"><h3>Investido</h3><p>R$ ${totalLoaned.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
          <div class="card"><h3>Lucro Previsto</h3><p>R$ ${totalProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
          <div class="card"><h3>Recebido</h3><p>R$ ${paidAmountVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
          <div class="card"><h3>Em Aberto</h3><p>R$ ${(totalExpectedVal - paidAmountVal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Valor Emprestado</th>
              <th>Total Recebido</th>
              <th>Saldo Devedor</th>
              <th>Lucro Bruto</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${loans.map(loan => {
              const paid = loan.schedule.filter(s => s.paid).reduce((acc, curr) => acc + curr.payment, 0);
              const expected = loan.installmentValue * loan.installments;
              const isFinished = loan.schedule.every(s => s.paid);
              return `
                <tr>
                  <td><strong>${loan.client}</strong></td>
                  <td>R$ ${loan.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>R$ ${paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>R$ ${(expected - paid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>R$ ${(expected - loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>${isFinished ? 'LIQUIDADO' : 'ATIVO'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div class="footer">
          Loy Gestor Financial Systems &copy; 2026 - Todos os direitos reservados
        </div>
        <script>
          window.onload = () => {
            setTimeout(() => {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const paymentStatusData = useMemo(() => {
    let paid = 0;
    let pending = 0;
    loans.forEach(loan => {
      loan.schedule.forEach(item => {
        if (item.paid) paid += item.payment;
        else pending += item.payment;
      });
    });
    return [
      { name: 'Recebido', value: paid },
      { name: 'Pendente', value: pending }
    ];
  }, [loans]);

  const pieData = useMemo(() => {
    const data: Record<string, number> = {};
    loans.forEach(loan => {
      data[loan.client] = (data[loan.client] || 0) + loan.amount;
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [loans]);

  const monthlyData = useMemo(() => {
    const data: Record<string, { month: string, expected: number, received: number }> = {};
    
    loans.forEach(loan => {
      loan.schedule.forEach(item => {
        const date = new Date(item.dueDate);
        const monthName = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        const monthKey = item.dueDate.substring(0, 7); // YYYY-MM for sorting
        
        if (!data[monthKey]) {
          data[monthKey] = { month: monthName, expected: 0, received: 0 };
        }
        data[monthKey].expected += item.payment;
        if (item.paid) {
          data[monthKey].received += item.payment;
        }
      });
    });

    return Object.values(data).sort((_a, _b) => {
      // We need the keys to sort properly, but the values only have the formatted month
      // Let's re-calculate keys or just use a more robust sorting if needed.
      // Actually, since we want to sort by date, let's keep the key in the object temporarily.
      return 0; // Placeholder, will fix below
    });
  }, [loans]);

  // Improved monthlyData with proper sorting
  const sortedMonthlyData = useMemo(() => {
    const dataMap: Record<string, { month: string, expected: number, received: number, sortKey: string }> = {};
    
    loans.forEach(loan => {
      loan.schedule.forEach(item => {
        const date = new Date(item.dueDate + 'T12:00:00'); // Avoid timezone issues
        const monthLabel = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        const sortKey = item.dueDate.substring(0, 7);
        
        if (!dataMap[sortKey]) {
          dataMap[sortKey] = { month: monthLabel, expected: 0, received: 0, sortKey };
        }
        dataMap[sortKey].expected += item.payment;
        if (item.paid) {
          dataMap[sortKey].received += item.payment;
        }
      });
    });

    return Object.values(dataMap)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(({ month, expected, received }) => ({ month, expected, received }));
  }, [loans]);

  const COLORS = useMemo(() => {
    const themeColors: Record<string, string[]> = {
      zinc: ['#18181b', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7'],
      indigo: ['#4355f3', '#6d84f7', '#a1b5fa', '#ced9fd', '#ebf0fe', '#f5f7ff'],
      rose: ['#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#ffe4e6', '#fff1f2'],
      emerald: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#ecfdf5'],
      amber: ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#fffbeb'],
    };
    return themeColors[theme] || themeColors.zinc;
  }, [theme]);

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ clients, loans }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "backup_emprestimos.json";
    link.click();
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-zinc-950">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-zinc-950 p-6 text-center">
        <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10 text-rose-500" />
        </div>
        <h1 className="text-2xl font-serif italic mb-2">Configuração Necessária</h1>
        <p className="text-zinc-500 max-w-md mb-8">
          As chaves do Firebase não foram encontradas. Por favor, configure as variáveis de ambiente no painel de Segredos do AI Studio ou no Netlify.
        </p>
        <div className="bg-zinc-100 dark:bg-zinc-900 p-4 rounded-xl text-left text-xs font-mono space-y-2 w-full max-w-md border border-zinc-200 dark:border-zinc-800 mb-8">
          <p className="text-zinc-400"># Variáveis necessárias:</p>
          <p>VITE_FIREBASE_API_KEY</p>
          <p>VITE_FIREBASE_AUTH_DOMAIN</p>
          <p>VITE_FIREBASE_PROJECT_ID</p>
          <p>VITE_FIREBASE_STORAGE_BUCKET</p>
          <p>VITE_FIREBASE_MESSAGING_SENDER_ID</p>
          <p>VITE_FIREBASE_APP_ID</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-screen bg-white dark:bg-zinc-950 p-4 overflow-hidden">
        {/* Subtle Grid Pattern */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]" 
             style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        
        {/* Colorful Background Blobs */}
        <div className="absolute inset-0 z-0">
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              rotate: [0, 90, 0],
              x: [0, 50, 0],
              y: [0, 30, 0]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/20 blur-[120px] dark:bg-indigo-500/10"
          />
          <motion.div 
            animate={{ 
              scale: [1, 1.3, 1],
              rotate: [0, -120, 0],
              x: [0, -40, 0],
              y: [0, 60, 0]
            }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/20 blur-[120px] dark:bg-emerald-500/10"
          />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative z-10 w-full max-w-md space-y-8 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-2xl p-8 rounded-3xl shadow-2xl border border-white/20 dark:border-zinc-800/50"
        >
          <div className="text-center space-y-2">
            <motion.div 
              animate={{ 
                y: [0, -10, 0],
                rotate: [0, 5, -5, 0]
              }}
              transition={{ 
                duration: 4, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
              className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-primary-900 to-primary-600 dark:from-primary-50 dark:to-primary-300 mb-4 shadow-xl ring-4 ring-primary-500/10 dark:ring-primary-500/5"
            >
              <Landmark className="w-10 h-10 text-white dark:text-primary-950" />
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex justify-center"
            >
              <Logo size="lg" />
            </motion.div>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium text-lg">Gestão Financeira de Alta Performance</p>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">E-mail</label>
                <Input 
                  type="email"
                  placeholder="seu@email.com"
                  className="h-14 text-lg rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 focus:ring-primary-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Senha</label>
                <Input 
                  type="password"
                  placeholder="••••••••"
                  className="h-14 text-lg rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 focus:ring-primary-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (isRegistering ? handleRegister() : handleLogin())}
                />
              </div>

              {loginError && (
                <motion.p 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-rose-500 text-sm font-bold text-center bg-rose-500/10 py-2 rounded-lg"
                >
                  {loginError}
                </motion.p>
              )}

              <Button 
                className="w-full h-14 text-lg font-bold rounded-2xl bg-primary-600 hover:bg-primary-700 text-white shadow-[0_6px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[6px] transition-all flex items-center justify-center gap-3" 
                onClick={isRegistering ? handleRegister : handleLogin}
              >
                {isRegistering ? <Plus className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
                {isRegistering ? "Criar Conta" : "Acessar Painel"}
              </Button>

              <div className="pt-4 flex flex-col gap-3">
                <div className="text-center">
                  <button 
                    onClick={() => setIsRegistering(!isRegistering)}
                    className="text-sm font-bold text-primary-600 hover:text-primary-700 underline underline-offset-4"
                  >
                    {isRegistering ? "Já tenho uma conta? Fazer Login" : "Não tem conta? Solicite ao Administrador"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300 relative"
      style={{ 
        backgroundColor: appBgColor || undefined,
        backgroundImage: appBackground ? `url(${appBackground})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Subtle Grid Pattern */}
      {!appBackground && (
        <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]" 
             style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      )}

      {/* App Notifications Overlay */}
      <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {appNotifications.map(notification => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
              className={cn(
                "pointer-events-auto w-72 p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex items-start gap-3",
                notification.type === 'success' ? "bg-emerald-500/90 text-white border-emerald-400" :
                notification.type === 'warning' ? "bg-amber-500/90 text-white border-amber-400" :
                "bg-zinc-900/90 text-white border-zinc-700"
              )}
            >
              <div className="mt-1">
                {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
                 notification.type === 'warning' ? <AlertCircle className="w-5 h-5" /> :
                 <Bell className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <p className="font-black text-xs uppercase tracking-widest leading-none mb-1">{notification.title}</p>
                <p className="text-[11px] font-medium opacity-90">{notification.message}</p>
              </div>
              <button 
                onClick={() => setAppNotifications(prev => prev.filter(n => n.id !== notification.id))}
                className="opacity-50 hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      <header className="sticky top-0 z-40 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <motion.div 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab('financeiro')}
              className="flex items-center gap-2 sm:gap-3 group cursor-pointer"
            >
              <motion.div 
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="p-1.5 rounded-lg bg-gradient-to-br from-primary-900 to-primary-600 dark:from-primary-50 dark:to-primary-300 shadow-md group-hover:shadow-lg transition-all duration-300"
              >
                <Landmark className="w-4 h-4 text-white dark:text-primary-950" />
              </motion.div>
              <Logo size="sm" />
            </motion.div>

            <div className="flex flex-col items-start ml-2 sm:ml-4 pl-2 sm:pl-4 border-l border-zinc-200 dark:border-zinc-800">
              <p className="text-[7px] sm:text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-0.5 flex items-center gap-1 sm:gap-1.5">
                <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                Sistema Ativo
                {isDemoMode && (
                  <motion.span 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[6px] sm:text-[8px] font-black uppercase tracking-widest"
                  >
                    Modo Demo
                  </motion.span>
                )}
              </p>
              <div className="flex items-center gap-1.5 sm:gap-3">
                <span className="text-[8px] sm:text-xs font-mono font-bold text-emerald-500 dark:text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                  {currentTime.toLocaleDateString('pt-BR')}
                </span>
                <span className="text-xs sm:text-xl font-mono font-black text-emerald-500 dark:text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,1)] animate-pulse">
                  {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              <nav className="hidden md:flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl mr-2 lg:mr-4">
                <Button 
                  variant={activeTab === 'dashboard' ? 'default' : 'ghost'} 
                  size="sm" 
                  onClick={() => setActiveTab('dashboard')}
                  className={cn(
                    "h-8 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                    activeTab === 'dashboard' ? "shadow-[0_2px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[2px]" : ""
                  )}
                >
                  Operacional
                </Button>
                <Button 
                  variant={activeTab === 'financeiro' ? 'default' : 'ghost'} 
                  size="sm" 
                  onClick={() => setActiveTab('financeiro')}
                  className={cn(
                    "h-8 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                    activeTab === 'financeiro' ? "shadow-[0_2px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[2px]" : ""
                  )}
                >
                  Financeiro
                </Button>
                <Button 
                  variant={activeTab === 'cobrancas' ? 'default' : 'ghost'} 
                  size="sm" 
                  onClick={() => setActiveTab('cobrancas')}
                  className={cn(
                    "h-8 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                    activeTab === 'cobrancas' ? "shadow-[0_2px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[2px]" : ""
                  )}
                >
                  Cobranças
                </Button>
                <Button 
                  variant={activeTab === 'arquivados' ? 'default' : 'ghost'} 
                  size="sm" 
                  onClick={() => setActiveTab('arquivados')}
                  className={cn(
                    "h-8 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                    activeTab === 'arquivados' ? "shadow-[0_2px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[2px]" : ""
                  )}
                >
                  Arquivados
                </Button>
              </nav>
              
            <div className="flex items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-8 h-8 rounded-full bg-primary-500/10 text-primary-600 hover:bg-primary-500/20"
                    onClick={() => {
                      if (!aiInsights) generateAIInsights();
                    }}
                  >
                    <Sparkles className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-black italic tracking-tighter">
                      <Sparkles className="w-6 h-6 text-primary-500 animate-pulse" />
                      ANÁLISE FINANCEIRA IA
                    </DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    {isGeneratingAI ? (
                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <div className="relative">
                          <div className="w-16 h-16 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin" />
                          <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-primary-500 animate-bounce" />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 animate-pulse">Consultando Inteligência Artificial...</p>
                      </div>
                    ) : (
                      <div className="prose dark:prose-invert max-w-none prose-sm">
                        <div className="markdown-body">
                          <Markdown>{aiInsights || "Clique no botão abaixo para gerar uma análise detalhada da sua carteira."}</Markdown>
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter className="flex sm:justify-between items-center gap-4">
                    <p className="text-[10px] text-zinc-400 italic">Análise baseada em dados reais da sua carteira atual.</p>
                    <Button 
                      onClick={generateAIInsights} 
                      disabled={isGeneratingAI}
                      className="gap-2 font-bold uppercase text-xs tracking-widest"
                    >
                      <RefreshCw className={cn("w-3 h-3", isGeneratingAI && "animate-spin")} />
                      Atualizar Análise
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full">
                    <Palette className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Palette className="w-5 h-5 text-primary-500" />
                      Personalizar Aplicativo
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase">Cor de Fundo</label>
                      <div className="flex items-center gap-2">
                        <Input 
                          type="color" 
                          value={appBgColor || "#ffffff"} 
                          onChange={(e) => setAppBgColor(e.target.value)}
                          className="w-12 h-9 p-1"
                        />
                        <Input 
                          value={appBgColor} 
                          onChange={(e) => setAppBgColor(e.target.value)}
                          placeholder="#ffffff"
                          className="flex-1"
                        />
                        <Button variant="ghost" size="sm" onClick={() => setAppBgColor("")}>Limpar</Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase">URL da Imagem de Fundo</label>
                      <div className="flex items-center gap-2">
                        <Input 
                          value={appBackground} 
                          onChange={(e) => setAppBackground(e.target.value)}
                          placeholder="https://exemplo.com/imagem.jpg"
                          className="flex-1"
                        />
                        <Button variant="ghost" size="sm" onClick={() => setAppBackground("")}>Limpar</Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="hidden sm:block">
                <ThemeSwitcher currentTheme={theme} onThemeChange={setTheme} />
              </div>
            </div>

              <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative w-8 h-8 rounded-full">
                    <Bell className="w-4 h-4" />
                    {notifications.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-900">
                        {notifications.length}
                      </span>
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-primary-500" />
                      Lembretes de Vencimento
                    </DialogTitle>
                  </DialogHeader>
                  <div className="max-h-[60vh] overflow-y-auto space-y-3 py-4">
                    {notifications.length === 0 ? (
                      <div className="text-center py-8 text-zinc-500 italic">
                        Nenhum vencimento pendente para hoje ou atrasado.
                      </div>
                    ) : (
                      notifications.map(alert => (
                        <div key={alert.id} className={cn(
                          "p-4 rounded-xl border flex items-center justify-between gap-4",
                          alert.type === 'overdue' 
                            ? "bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30" 
                            : "bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30"
                        )}>
                          <div className="space-y-1">
                            <p className="font-bold text-sm dark:text-zinc-100">{alert.client}</p>
                            <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider">
                              <span className={alert.type === 'overdue' ? "text-rose-600" : "text-amber-600"}>
                                {alert.type === 'overdue' ? 'Atrasado' : 'Vence Hoje'}
                              </span>
                              <span className="text-zinc-400">•</span>
                              <span className="text-zinc-500">{alert.date.split('-').reverse().join('/')}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-sm">R$ {alert.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 px-2 text-[10px] font-bold uppercase text-primary-600"
                              onClick={() => {
                                setShowNotifications(false);
                                setSearchTerm(alert.client);
                                setActiveTab('financeiro');
                              }}
                            >
                              Ver Cliente
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex items-center gap-1 sm:gap-2 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-full">
                <motion.div
                  animate={botActive ? { opacity: [1, 0.5, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={cn(
                    "flex items-center gap-2 px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-tighter transition-all",
                    botActive 
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
                      : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500"
                  )}
                >
                  {botActive ? <Bot className="w-3 h-3" /> : <BotOff className="w-3 h-3" />}
                  <span className="hidden lg:inline">{botActive ? "Bot Ativo" : "Bot Off"}</span>
                </motion.div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-full", !darkMode && "bg-white shadow-sm text-amber-500")}
                  onClick={() => setDarkMode(false)}
                >
                  <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-full", darkMode && "bg-zinc-700 shadow-sm text-indigo-400")}
                  onClick={() => setDarkMode(true)}
                >
                  <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={logout} className="gap-2 border-b-2 border-transparent active:translate-y-[1px] px-2 sm:px-3">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 pb-24 md:pb-8 space-y-8">
          {activeTab === 'dashboard' ? (
            <>
              {/* Stats Grid Header with Toggle */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-black italic tracking-tighter text-zinc-900 dark:text-zinc-100">RESUMO OPERACIONAL</h2>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Visão geral da sua carteira de investimentos</p>
                </div>
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                  {[
                    { id: 'loaned', label: 'Emprestado' },
                    { id: 'profit', label: 'Lucro' },
                    { id: 'expected', label: 'Carteira' },
                    { id: 'paid', label: 'Recebido' }
                  ].map(mode => (
                    <Button
                      key={mode.id}
                      variant={dashboardMode === mode.id ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setDashboardMode(mode.id as any)}
                      className={cn(
                        "h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
                        dashboardMode === mode.id ? "shadow-md" : ""
                      )}
                    >
                      {mode.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <Card className={cn(
              "overflow-hidden border-t-4 transition-all duration-500",
              dashboardMode === 'loaned' ? "border-t-primary-500 scale-[1.02] shadow-xl ring-2 ring-primary-500/20" : "border-t-zinc-200 dark:border-t-zinc-800 opacity-80"
            )}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Emprestado</p>
                  <Wallet className="w-4 h-4 text-primary-500" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">R$ {totalLoaned.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
              </CardContent>
            </Card>
            <Card className={cn(
              "overflow-hidden border-t-4 transition-all duration-500",
              dashboardMode === 'profit' ? "border-t-primary-500 scale-[1.02] shadow-xl ring-2 ring-primary-500/20" : "border-t-zinc-200 dark:border-t-zinc-800 opacity-80"
            )}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Lucro Previsto</p>
                  <TrendingUp className="w-4 h-4 text-primary-500" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">R$ {totalProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
                <p className="text-[10px] text-zinc-400 mt-1">
                  Já realizado: <span className="text-zinc-900 dark:text-zinc-100 font-medium">R$ {paidProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </p>
              </CardContent>
            </Card>
            <Card className={cn(
              "overflow-hidden border-t-4 transition-all duration-500",
              dashboardMode === 'paid' ? "border-t-primary-500 scale-[1.02] shadow-xl ring-2 ring-primary-500/20" : "border-t-zinc-200 dark:border-t-zinc-800 opacity-80"
            )}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Recebido</p>
                  <LucidePieChart className="w-4 h-4 text-primary-500" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">R$ {paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-t-4 border-t-zinc-200 dark:border-t-zinc-800 opacity-80">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">A Receber</p>
                  <TrendingUp className="w-4 h-4 text-primary-500" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">R$ {(totalExpected - paidAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
              </CardContent>
            </Card>
            <Card className={cn(
              "overflow-hidden border-t-4 transition-all duration-500",
              dashboardMode === 'expected' ? "border-t-primary-500 scale-[1.02] shadow-xl ring-2 ring-primary-500/20" : "border-t-zinc-200 dark:border-t-zinc-800 opacity-80"
            )}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Carteira Total</p>
                  <Users className="w-4 h-4 text-primary-500" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">R$ {totalExpected.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-t-4 border-t-primary-500">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Status do Bot</p>
                  {botActive ? <Bot className="w-4 h-4 text-emerald-500" /> : <BotOff className="w-4 h-4 text-zinc-400" />}
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", botActive ? "bg-emerald-500 animate-pulse" : "bg-zinc-300")} />
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                    {botActive ? "Operando" : "Inativo"}
                  </h2>
                </div>
                <p className="text-[10px] text-zinc-400 mt-1">
                  {isWhatsAppSynced ? "WhatsApp Conectado" : "Aguardando Conexão"}
                </p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-t-4 border-t-primary-500">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Clientes</p>
                  <Users className="w-4 h-4 text-primary-500" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{loans.length}</h2>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-t-4 border-t-rose-500">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Vencimentos</p>
                  <Calendar className="w-4 h-4 text-rose-500" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {notifications.length}
                </h2>
                <p className="text-[10px] text-zinc-400 mt-1">
                  {notifications.filter(n => n.type === 'overdue').length} atrasados
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Admin Controls */}
          {user.role === "admin" && (
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Plus className="w-5 h-5" /> Novo Empréstimo
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">Cliente</label>
                    <Input placeholder="Nome do cliente" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">WhatsApp</label>
                    <Input placeholder="(00) 00000-0000" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">Valor (R$)</label>
                    <Input placeholder="0.00" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">Juros Mensais (%)</label>
                    <Input placeholder="0" type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">Parcelas</label>
                    <Input placeholder="0" type="number" value={form.installments} onChange={(e) => setForm({ ...form, installments: e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">Foto do Cliente</label>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden border border-zinc-200 dark:border-zinc-700">
                        {form.photo ? (
                          <img src={form.photo} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-zinc-400" />
                        )}
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-10 gap-2 shadow-[0_2px_0_0_rgba(0,0,0,0.05)] active:shadow-none active:translate-y-[2px]"
                        onClick={() => document.getElementById('photo-upload')?.click()}
                      >
                        <Camera className="w-4 h-4" />
                        {form.photo ? "Trocar" : "Adicionar"}
                      </Button>
                      {form.photo && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-10 w-10 text-red-500 shadow-[0_2px_0_0_rgba(239,68,68,0.1)] active:shadow-none active:translate-y-[2px]"
                          onClick={() => setForm({ ...form, photo: "" })}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                      <input 
                        id="photo-upload" 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setForm({ ...form, photo: reader.result as string });
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 md:col-span-5 pt-2">
                    <Switch 
                      id="interest-only" 
                      checked={form.type === 'interest-only'} 
                      onCheckedChange={(checked) => setForm({ ...form, type: checked ? 'interest-only' : 'standard' })} 
                    />
                    <label htmlFor="interest-only" className="text-sm font-medium cursor-pointer">Apenas Juros (Principal no final)</label>
                  </div>

                  {form.amount && form.rate && form.installments && (
                    <div className="md:col-span-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">
                          {form.type === 'interest-only' ? 'Juros Mensais' : 'Valor da Parcela'}
                        </p>
                        <p className="text-lg font-black text-primary-600 dark:text-primary-400">
                          R$ {form.type === 'interest-only' 
                            ? (parseFloat(form.amount) * (parseFloat(form.rate)/100)).toFixed(2)
                            : ( (parseFloat(form.amount) + (parseFloat(form.amount) * (parseFloat(form.rate)/100) * parseInt(form.installments))) / parseInt(form.installments) ).toFixed(2)
                          }
                        </p>
                        {form.type === 'interest-only' && (
                          <p className="text-[10px] text-zinc-400 mt-1">+ Principal na última parcela</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Total de Juros</p>
                        <p className="text-lg font-black text-amber-600 dark:text-amber-400">
                          R$ {(parseFloat(form.amount) * (parseFloat(form.rate)/100) * parseInt(form.installments)).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Total a Receber</p>
                        <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                          R$ {(parseFloat(form.amount) + (parseFloat(form.amount) * (parseFloat(form.rate)/100) * parseInt(form.installments))).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-4 space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Observações / Informações Adicionais</p>
                    <textarea 
                      value={form.notes} 
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full min-h-[80px] p-3 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all resize-none"
                      placeholder="Adicione informações extras sobre o cliente ou o empréstimo..."
                    />
                  </div>

                  <MotionButton 
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className="md:col-span-4 mt-2 h-12 text-base font-bold rounded-xl bg-primary-600 hover:bg-primary-700 text-white shadow-[0_4px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[4px] transition-all" 
                    onClick={addLoan}
                  >
                    <Plus className="mr-2 h-5 w-5"/> Confirmar Empréstimo
                  </MotionButton>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Chart Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-6">Acompanhamento de Recebimentos (Linha)</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sortedMonthlyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#333" : "#eee"} />
                      <XAxis dataKey="month" stroke={darkMode ? "#888" : "#444"} fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke={darkMode ? "#888" : "#444"} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R$${value}`} />
                      <Tooltip 
                        formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        contentStyle={{ 
                          backgroundColor: darkMode ? "#18181b" : "#fff", 
                          borderColor: darkMode ? "#3f3f46" : "#e4e4e7",
                          borderRadius: "8px",
                          color: darkMode ? "#f4f4f5" : "#18181b"
                        }}
                        itemStyle={{ color: darkMode ? "#f4f4f5" : "#18181b" }}
                        labelStyle={{ color: darkMode ? "#a1a1aa" : "#71717a" }}
                      />
                      <Legend verticalAlign="top" height={36}/>
                      <Line 
                        name="Esperado"
                        type="monotone" 
                        dataKey="expected" 
                        stroke="#94a3b8" 
                        strokeWidth={2} 
                        strokeDasharray="5 5"
                        dot={{ r: 3, fill: "#94a3b8" }}
                      />
                      <Line 
                        name="Recebido"
                        type="monotone" 
                        dataKey="received" 
                        stroke="var(--primary-600)" 
                        strokeWidth={3} 
                        dot={{ r: 4, fill: "var(--primary-600)", strokeWidth: 2, stroke: "#fff" }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-6">Acompanhamento de Recebimentos (Barras)</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sortedMonthlyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#333" : "#eee"} />
                      <XAxis dataKey="month" stroke={darkMode ? "#888" : "#444"} fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke={darkMode ? "#888" : "#444"} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R$${value}`} />
                      <Tooltip 
                        formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        contentStyle={{ 
                          backgroundColor: darkMode ? "#18181b" : "#fff", 
                          borderColor: darkMode ? "#3f3f46" : "#e4e4e7",
                          borderRadius: "8px",
                          color: darkMode ? "#f4f4f5" : "#18181b"
                        }}
                        itemStyle={{ color: darkMode ? "#f4f4f5" : "#18181b" }}
                        labelStyle={{ color: darkMode ? "#a1a1aa" : "#71717a" }}
                      />
                      <Legend verticalAlign="top" height={36}/>
                      <Bar name="Esperado" dataKey="expected" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar name="Recebido" dataKey="received" fill="var(--primary-600)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-6">Status de Recebimentos</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill="var(--primary-600)" />
                        <Cell fill="#94a3b8" />
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        contentStyle={{ 
                          backgroundColor: darkMode ? "#18181b" : "#fff", 
                          borderColor: darkMode ? "#3f3f46" : "#e4e4e7",
                          borderRadius: "8px",
                          color: darkMode ? "#f4f4f5" : "#18181b"
                        }}
                        itemStyle={{ color: darkMode ? "#f4f4f5" : "#18181b" }}
                        labelStyle={{ color: darkMode ? "#a1a1aa" : "#71717a" }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-3">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-500" />
                    Clientes perto de vencer
                  </h2>
                  <span className="text-xs text-zinc-500 font-medium bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-full">
                    Próximos 7 dias
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Parcela</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {upcomingPayments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                            Nenhum pagamento próximo do vencimento.
                          </TableCell>
                        </TableRow>
                      ) : (
                        upcomingPayments.map((payment) => {
                          const isOverdue = new Date(payment.dueDate) < new Date(new Date().setHours(0,0,0,0));
                          return (
                            <TableRow key={`${payment.loanId}-${payment.installment}`}>
                              <TableCell className="font-medium">{payment.client}</TableCell>
                              <TableCell className="text-zinc-500">{payment.installment}ª</TableCell>
                              <TableCell className={cn(
                                "font-mono",
                                isOverdue ? "text-rose-500 font-bold" : "text-zinc-500"
                              )}>
                                {new Date(payment.dueDate).toLocaleDateString('pt-BR')}
                              </TableCell>
                              <TableCell className="font-semibold">R$ {payment.amount.toFixed(2)}</TableCell>
                              <TableCell className="text-right">
                                <span className={cn(
                                  "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full",
                                  isOverdue ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                )}>
                                  {isOverdue ? "Atrasado" : "Pendente"}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Loan List & Installments */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h2 className="text-xl font-bold">Controle de Carteira Ativa</h2>
                <div className="flex flex-1 max-w-md items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input 
                      placeholder="Buscar por nome ou WhatsApp..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLoans.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-zinc-500 italic">
                    {searchTerm ? "Nenhum cliente encontrado para esta busca." : "Nenhum empréstimo registrado no sistema."}
                  </div>
                ) : (
                  filteredLoans.map((loan) => (
                    <Dialog key={loan.id}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="h-auto p-4 flex flex-col items-start gap-1 justify-start text-left hover:border-zinc-900 dark:hover:border-zinc-100 transition-all group relative">
                          <div className="flex justify-between items-start w-full">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden border border-zinc-200 dark:border-zinc-700 shrink-0">
                                {loan.photo ? (
                                  <img src={loan.photo} alt={loan.client} className="w-full h-full object-cover" />
                                ) : (
                                  <User className="w-5 h-5 text-zinc-400" />
                                )}
                              </div>
                              <span className="font-bold text-lg text-zinc-900 dark:text-zinc-100 truncate max-w-[150px]">{loan.client}</span>
                            </div>
                            {loan.whatsapp && (
                              <a 
                                href={`https://wa.me/${loan.whatsapp.replace(/\D/g, '')}?text=${getWhatsAppMessage(loan)}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 transition-colors"
                                title="Enviar Extrato via WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                          <div className="flex justify-between w-full text-xs text-zinc-500">
                            <span>R$ {loan.amount.toLocaleString('pt-BR')}</span>
                            <span className="flex items-center gap-1">
                              {loan.type === 'interest-only' && <span className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold">APENAS JUROS</span>}
                              {loan.installments}x
                            </span>
                          </div>
                          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div 
                              className="bg-zinc-900 dark:bg-zinc-100 h-full transition-all" 
                              style={{ width: `${(loan.schedule.filter(s => s.paid).length / loan.installments) * 100}%` }}
                            />
                          </div>
                        </Button>
                      </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader className="sticky top-0 z-50 bg-white dark:bg-zinc-950 pb-4 border-b border-zinc-100 dark:border-zinc-800 -mx-6 px-6">
                            <div className="flex items-center justify-between mb-2">
                              <DialogClose asChild>
                                <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                                  <ArrowLeft className="w-4 h-4" />
                                  Voltar
                                </Button>
                              </DialogClose>
                              <div className="flex items-center gap-2">
                                {confirmDeleteId === loan.id ? (
                                  <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-900/20 p-1 rounded-lg border border-rose-200 dark:border-rose-800">
                                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 px-2">Confirmar?</span>
                                    <Button 
                                      variant="destructive" 
                                      size="sm" 
                                      className="h-7 px-3 text-[10px] font-bold uppercase shadow-[0_2px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[2px]"
                                      onClick={() => { deleteLoan(loan.id); setConfirmDeleteId(null); }}
                                    >
                                      Sim, Excluir
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-7 px-3 text-[10px] font-bold uppercase"
                                      onClick={() => setConfirmDeleteId(null)}
                                    >
                                      Não
                                    </Button>
                                  </div>
                                ) : (
                                  <Button 
                                    variant="destructive" 
                                    size="sm" 
                                    className="gap-2 h-8 text-[10px] font-bold uppercase shadow-[0_2px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[2px]"
                                    onClick={() => setConfirmDeleteId(loan.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Excluir
                                  </Button>
                                )}
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="gap-2 h-8 text-[10px] font-bold uppercase border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/20 shadow-[0_2px_0_0_rgba(0,0,0,0.05)] active:shadow-none active:translate-y-[2px]"
                                  onClick={() => archiveLoan(loan.id)}
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                  Arquivar
                                </Button>
                              </div>
                            </div>
                            <DialogTitle className="text-2xl flex items-center gap-3">
                              <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden border border-zinc-200 dark:border-zinc-700 shrink-0">
                                {loan.photo ? (
                                  <img src={loan.photo} alt={loan.client} className="w-full h-full object-cover" />
                                ) : (
                                  <User className="w-6 h-6 text-zinc-400" />
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="flex items-center gap-2">
                                  <Logo size="sm" className="mr-1" />
                                  Extrato - {loan.client}
                                  {loan.whatsapp && (
                                    <a 
                                      href={`https://wa.me/${loan.whatsapp.replace(/\D/g, '')}?text=${getWhatsAppMessage(loan)}`} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-200 dark:hover:bg-emerald-800/50 transition-all shadow-[0_2px_0_0_rgba(16,185,129,0.3)] active:shadow-none active:translate-y-[2px]"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                      WhatsApp
                                    </a>
                                  )}
                                </span>
                                {loan.type === 'interest-only' && <span className="text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400 font-black">MODALIDADE: APENAS JUROS</span>}
                              </div>
                            </DialogTitle>
                          </DialogHeader>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-500 uppercase">Foto do Cliente</label>
                              <div className="flex items-center gap-3">
                                <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden border border-zinc-200 dark:border-zinc-700 shrink-0">
                                  {loan.photo ? (
                                    <img src={loan.photo} alt={loan.client} className="w-full h-full object-cover" />
                                  ) : (
                                    <User className="w-8 h-8 text-zinc-400" />
                                  )}
                                </div>
                                <div className="flex flex-col gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 text-[10px] uppercase font-bold shadow-[0_2px_0_0_rgba(0,0,0,0.05)] active:shadow-none active:translate-y-[2px]"
                                    onClick={() => document.getElementById(`photo-edit-${loan.id}`)?.click()}
                                  >
                                    <Camera className="w-3 h-3 mr-1" />
                                    Alterar Foto
                                  </Button>
                                  {loan.photo && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-8 text-[10px] uppercase font-bold text-red-500 shadow-[0_2px_0_0_rgba(239,68,68,0.1)] active:shadow-none active:translate-y-[2px]"
                                      onClick={() => updateLoan(loan.id, { photo: "" })}
                                    >
                                      Remover
                                    </Button>
                                  )}
                                  <input 
                                    id={`photo-edit-${loan.id}`} 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onloadend = () => {
                                          updateLoan(loan.id, { photo: reader.result as string });
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-500 uppercase">Nome do Cliente</label>
                              <Input 
                                value={loan.client} 
                                onChange={(e) => updateLoan(loan.id, { client: e.target.value })}
                                className="h-9 text-zinc-900 dark:text-zinc-100"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-500 uppercase">WhatsApp</label>
                              <Input 
                                value={loan.whatsapp || ""} 
                                onChange={(e) => updateLoan(loan.id, { whatsapp: e.target.value })}
                                className="h-9 text-zinc-900 dark:text-zinc-100"
                                placeholder="(00) 00000-0000"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-500 uppercase">Valor Principal</label>
                              <Input 
                                type="number"
                                value={loan.amount} 
                                onChange={(e) => updateLoan(loan.id, { amount: parseFloat(e.target.value) })}
                                className="h-9 text-zinc-900 dark:text-zinc-100 font-bold"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-500 uppercase">Taxa (%)</label>
                              <Input 
                                type="number"
                                value={loan.rate} 
                                onChange={(e) => updateLoan(loan.id, { rate: parseFloat(e.target.value) })}
                                className="h-9 text-zinc-900 dark:text-zinc-100 font-bold"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-500 uppercase">Parcelas</label>
                              <Input 
                                type="number"
                                value={loan.installments} 
                                onChange={(e) => updateLoan(loan.id, { installments: parseInt(e.target.value) })}
                                className="h-9 text-zinc-900 dark:text-zinc-100 font-bold"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-500 uppercase">Modalidade</label>
                              <select 
                                value={loan.type}
                                onChange={(e) => updateLoan(loan.id, { type: e.target.value as 'standard' | 'interest-only' })}
                                className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                              >
                                <option value="standard">Padrão</option>
                                <option value="interest-only">Apenas Juros</option>
                              </select>
                            </div>
                            <div className="flex items-end">
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                className="w-full h-9 gap-2 font-bold uppercase text-[10px] shadow-[0_2px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-[2px]"
                                onClick={() => recalculateLoan(loan.id, loan.amount, loan.rate, loan.installments, loan.type)}
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Recalcular Cronograma
                              </Button>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-xs font-bold text-zinc-500 uppercase">Observações / Informações Adicionais</label>
                              <textarea 
                                value={loan.notes || ""} 
                                onChange={(e) => updateLoan(loan.id, { notes: e.target.value })}
                                className="w-full min-h-[80px] p-3 text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 resize-none"
                                placeholder="Adicione informações extras sobre o cliente ou o empréstimo..."
                              />
                            </div>
                          </div>

                          <div className="mt-4 overflow-y-auto max-h-[45vh] rounded-lg border border-zinc-200 dark:border-zinc-800 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
                          <Table>
                            <TableHeader className="bg-zinc-50 dark:bg-zinc-900 sticky top-0 z-10">
                              <TableRow>
                                <TableHead className="w-12">#</TableHead>
                                <TableHead>Principal</TableHead>
                                <TableHead>Juros</TableHead>
                                <TableHead>Total</TableHead>
                                <TableHead>Vencimento</TableHead>
                                <TableHead className="text-right">Ação</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {loan.schedule.map((row) => (
                                <TableRow key={row.installment} className={cn(
                                  row.paid ? "bg-emerald-50/50 dark:bg-emerald-900/10" : "bg-rose-50/50 dark:bg-rose-900/10"
                                )}>
                                  <TableCell className={cn(
                                    "font-mono font-bold",
                                    row.paid ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                  )}>
                                    {row.installment.toString().padStart(2, '0')}
                                  </TableCell>
                                  <TableCell className={cn(
                                    row.paid ? "text-emerald-600/70 dark:text-emerald-400/70" : "text-rose-600/70 dark:text-rose-400/70"
                                  )}>
                                    R$ {row.principal.toFixed(2)}
                                  </TableCell>
                                  <TableCell className={cn(
                                    row.paid ? "text-emerald-600/70 dark:text-emerald-400/70" : "text-rose-600/70 dark:text-rose-400/70"
                                  )}>
                                    R$ {row.interest.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="font-semibold">
                                    <div className="flex items-center gap-1">
                                      <span className={cn(
                                        "text-xs",
                                        row.paid ? "text-emerald-400" : "text-rose-400"
                                      )}>R$</span>
                                      <Input 
                                        type="number"
                                        value={row.payment}
                                        onChange={(e) => updateInstallmentAmount(loan.id, row.installment, parseFloat(e.target.value))}
                                        className={cn(
                                          "h-8 w-[100px] text-xs font-bold bg-transparent border-zinc-200 dark:border-zinc-800 focus:ring-1 focus:ring-primary-500",
                                          row.paid ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
                                        )}
                                      />
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Input 
                                      type="date" 
                                      value={row.dueDate} 
                                      onChange={(e) => updateDueDate(loan.id, row.installment, e.target.value)}
                                      className={cn(
                                        "h-8 w-[140px] text-xs bg-transparent border-zinc-200 dark:border-zinc-800 focus:ring-1 focus:ring-primary-500",
                                        row.paid ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
                                      )}
                                    />
                                  </TableCell>
                                  <TableCell className="text-right flex gap-2 justify-end">
                                    {!row.paid && (
                                      <MotionButton
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                        size="sm"
                                        variant={row.overdue ? "destructive" : "outline"}
                                        className={cn(
                                          "gap-2 transition-all duration-100 min-w-[110px]",
                                          row.overdue 
                                            ? "bg-red-600 hover:bg-red-700 text-white shadow-[0_2px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[2px]" 
                                            : "text-red-600 border-red-200 hover:bg-red-50 shadow-[0_2px_0_0_rgba(0,0,0,0.05)] active:shadow-none active:translate-y-[2px]"
                                        )}
                                        onClick={() => toggleOverdue(loan.id, row.installment)}
                                      >
                                        <Clock className="w-4 h-4" />
                                        {row.overdue ? "Atrasada" : "Atrasar"}
                                      </MotionButton>
                                    )}
                                    <MotionButton 
                                      key={row.paid ? "paid" : "unpaid"}
                                      initial={{ scale: 0.95, opacity: 0.8 }}
                                      animate={{ scale: 1, opacity: 1 }}
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                      size="sm"
                                      variant={row.paid ? "secondary" : "default"}
                                      className={cn(
                                        "gap-2 transition-all duration-100 min-w-[110px]",
                                        row.paid 
                                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 shadow-[0_2px_0_0_rgba(16,185,129,0.2)] active:shadow-none active:translate-y-[2px]" 
                                          : "shadow-[0_2px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[2px]"
                                      )}
                                      onClick={() => togglePayment(loan.id, row.installment)}
                                    >
                                      {row.paid ? (
                                        <motion.div 
                                          initial={{ scale: 0, rotate: -45 }}
                                          animate={{ scale: 1, rotate: 0 }}
                                          className="flex items-center gap-2"
                                        >
                                          <CheckCircle2 className="w-4 h-4" />
                                          Liquidado
                                        </motion.div>
                                      ) : (
                                        <motion.span
                                          initial={{ opacity: 0 }}
                                          animate={{ opacity: 1 }}
                                        >
                                          Marcar Pago
                                        </motion.span>
                                      )}
                                    </MotionButton>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <ScrollToBottom />
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
          </>
          ) : activeTab === 'financeiro' ? (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">Setor Financeiro</h1>
                  <p className="text-zinc-500 dark:text-zinc-400">Análise detalhada de rentabilidade e carteira de clientes</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={() => setActiveTab('dashboard')} variant="outline" className="gap-2 font-bold uppercase text-xs shadow-[0_2px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-[2px]">
                    <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
                  </Button>
                  <Button className="gap-2 font-bold uppercase text-xs bg-primary-600 hover:bg-primary-700 text-white shadow-[0_3px_0_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[3px]" onClick={generateReport}>
                    <Landmark className="w-4 h-4" /> Gerar Relatório
                  </Button>
                </div>
              </div>

              {/* Financial Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="overflow-hidden border-t-4 border-t-primary-500 bg-white dark:bg-zinc-900 shadow-sm transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Capital Investido</p>
                      <Wallet className="w-4 h-4 text-primary-500" />
                    </div>
                    <h3 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">R$ {totalLoaned.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-t-4 border-t-primary-500 bg-white dark:bg-zinc-900 shadow-sm transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Lucro Total Previsto</p>
                      <TrendingUp className="w-4 h-4 text-primary-500" />
                    </div>
                    <h3 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">R$ {totalProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-t-4 border-t-primary-500 bg-white dark:bg-zinc-900 shadow-sm transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Total Já Recebido</p>
                      <CheckCircle2 className="w-4 h-4 text-primary-500" />
                    </div>
                    <h3 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">R$ {paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-t-4 border-t-primary-500 bg-white dark:bg-zinc-900 shadow-sm transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Rentabilidade Média</p>
                      <Sparkles className="w-4 h-4 text-primary-500" />
                    </div>
                    <h3 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
                      {totalLoaned > 0 ? ((totalProfit / totalLoaned) * 100).toFixed(1) : 0}%
                    </h3>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <h2 className="font-bold flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary-500" />
                    Relatório Detalhado por Cliente
                  </h2>
                  <div className="text-xs font-medium text-zinc-500">
                    Total: {loans.length} clientes ativos
                  </div>
                </div>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/30">
                        <TableRow>
                          <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Cliente</TableHead>
                          <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Investido</TableHead>
                          <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Recebido</TableHead>
                          <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Pendente</TableHead>
                          <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Lucro</TableHead>
                          <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Status</TableHead>
                          <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Próx. Vencimento</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loans.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-12 text-zinc-500">
                              Nenhum dado financeiro disponível.
                            </TableCell>
                          </TableRow>
                        ) : (
                          loans.map(loan => {
                            const totalPaid = loan.schedule.filter(s => s.paid).reduce((acc, curr) => acc + curr.payment, 0);
                            const totalExpectedVal = loan.installmentValue * loan.installments;
                            const remaining = totalExpectedVal - totalPaid;
                            const profit = totalExpectedVal - loan.amount;
                            const nextPayment = loan.schedule.find(s => !s.paid);
                            const isFinished = loan.schedule.every(s => s.paid);
                            
                            return (
                              <TableRow key={loan.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                                <TableCell className="font-bold flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden border border-zinc-200 dark:border-zinc-700 shrink-0">
                                    {loan.photo ? (
                                      <img src={loan.photo} alt={loan.client} className="w-full h-full object-cover" />
                                    ) : (
                                      <User className="w-4 h-4 text-zinc-400" />
                                    )}
                                  </div>
                                  {loan.client}
                                </TableCell>
                                <TableCell className="font-medium">R$ {loan.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-zinc-900 dark:text-zinc-100 font-bold">R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-zinc-900 dark:text-zinc-100 font-bold">R$ {remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-zinc-900 dark:text-zinc-100 font-bold">R$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell>
                                  {isFinished ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase">
                                      <CheckCircle2 className="w-3 h-3" /> Liquidado
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase">
                                      <Clock className="w-3 h-3" /> Ativo
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="font-mono text-sm font-bold text-zinc-500">
                                  {nextPayment ? new Date(nextPayment.dueDate).toLocaleDateString('pt-BR') : '-'}
                                </TableCell>
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h2 className="font-bold flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-primary-500" />
                    Extrato Geral de Movimentações
                  </h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">De:</label>
                      <Input 
                        type="date" 
                        value={startDate} 
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-8 w-[130px] text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Até:</label>
                      <Input 
                        type="date" 
                        value={endDate} 
                        onChange={(e) => setEndDate(e.target.value)}
                        className="h-8 w-[130px] text-xs"
                      />
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => { setStartDate(""); setEndDate(""); }}
                      className="h-8 px-2 text-[10px] font-bold uppercase"
                    >
                      Limpar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={exportTransactions}
                      className="h-8 gap-2 text-[10px] font-bold uppercase shadow-[0_2px_0_0_rgba(0,0,0,0.05)] active:shadow-none active:translate-y-[2px]"
                    >
                      <Download className="w-3.5 h-3.5" /> Exportar
                    </Button>
                  </div>
                </div>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[500px]">
                    <Table>
                      <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/30 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Data</TableHead>
                          <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Tipo</TableHead>
                          <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Cliente</TableHead>
                          <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Descrição</TableHead>
                          <TableHead className="font-bold text-zinc-900 dark:text-zinc-100 text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTransactions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-12 text-zinc-500">
                              Nenhuma movimentação encontrada para o período selecionado.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredTransactions.map(t => (
                            <TableRow key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                              <TableCell className="font-mono text-xs">
                                {new Date(t.date).toLocaleDateString('pt-BR')}
                              </TableCell>
                              <TableCell>
                                <span className={cn(
                                  "text-[10px] font-black uppercase px-2 py-0.5 rounded-md",
                                  t.type === 'inflow' 
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" 
                                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                                )}>
                                  {t.type === 'inflow' ? 'Entrada' : 'Saída'}
                                </span>
                              </TableCell>
                              <TableCell className="font-bold text-sm">{t.clientName || '-'}</TableCell>
                              <TableCell className="text-zinc-500 text-xs">{t.description}</TableCell>
                              <TableCell className="text-right font-black text-zinc-900 dark:text-zinc-100">
                                {t.type === 'inflow' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Monthly Breakdown Chart in Financeiro Tab */}
              <Card className="border-zinc-200 dark:border-zinc-800">
                <CardContent className="p-6">
                  <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    Projeção de Fluxo de Caixa Mensal
                  </h2>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sortedMonthlyData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#333" : "#eee"} />
                        <XAxis dataKey="month" stroke={darkMode ? "#888" : "#444"} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke={darkMode ? "#888" : "#444"} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R$${value}`} />
                        <Tooltip 
                          formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                          contentStyle={{ 
                            backgroundColor: darkMode ? "#18181b" : "#fff", 
                            borderColor: darkMode ? "#3f3f46" : "#e4e4e7",
                            borderRadius: "8px",
                            color: darkMode ? "#f4f4f5" : "#18181b"
                          }}
                        />
                        <Legend />
                        <Bar name="Receita Esperada" dataKey="expected" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        <Bar name="Receita Realizada" dataKey="received" fill="var(--primary-600)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : activeTab === 'cobrancas' ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
                    <MessageCircle className="w-8 h-8 text-emerald-500" />
                    Central de Cobranças
                  </h1>
                  <p className="text-zinc-500 dark:text-zinc-400">Gerenciamento de atrasos e automação de mensagens WhatsApp</p>
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={() => setActiveTab('dashboard')} variant="outline" className="gap-2 font-bold uppercase text-xs shadow-[0_2px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-[2px]">
                    <ArrowLeft className="w-4 h-4" /> Voltar
                  </Button>
                  <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700">
                    <div className={cn(
                      "w-2 h-2 rounded-full animate-pulse",
                      botActive ? "bg-emerald-500" : "bg-zinc-400"
                    )} />
                    <span className="text-[10px] font-bold uppercase tracking-widest mr-2">Status do Bot</span>
                    <Switch 
                      checked={botActive} 
                      onCheckedChange={setBotActive}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Overdue List */}
                <div className="lg:col-span-2 space-y-6">
                  <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                      <h2 className="font-bold flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-rose-500" />
                        Clientes com Pagamentos em Atraso
                      </h2>
                    </div>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/30">
                            <TableRow>
                              <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Cliente</TableHead>
                              <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Atrasos</TableHead>
                              <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Total Devido</TableHead>
                              <TableHead className="font-bold text-zinc-900 dark:text-zinc-100">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {loans.filter(loan => 
                              loan.schedule.some(s => !s.paid && new Date(s.dueDate) < new Date(new Date().setHours(0,0,0,0)))
                            ).length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center py-12 text-zinc-500">
                                  <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                  <p className="font-bold uppercase tracking-widest text-xs">Nenhum atraso detectado!</p>
                                  <p className="text-[10px]">Sua carteira está 100% em dia.</p>
                                </TableCell>
                              </TableRow>
                            ) : (
                              loans.filter(loan => 
                                loan.schedule.some(s => !s.paid && new Date(s.dueDate) < new Date(new Date().setHours(0,0,0,0)))
                              ).map(loan => {
                                const overdue = loan.schedule.filter(s => !s.paid && new Date(s.dueDate) < new Date(new Date().setHours(0,0,0,0)));
                                const totalOverdue = overdue.reduce((acc, curr) => acc + curr.payment, 0);
                                
                                return (
                                  <TableRow key={loan.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                                    <TableCell className="font-bold">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden border border-zinc-200 dark:border-zinc-700">
                                          {loan.photo ? <img src={loan.photo} className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-zinc-400" />}
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <p>{loan.client}</p>
                                            <motion.div
                                              animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
                                              transition={{ duration: 1.5, repeat: Infinity }}
                                              className="text-rose-500"
                                            >
                                              <AlertCircle className="w-3.5 h-3.5" />
                                            </motion.div>
                                          </div>
                                          <p className="text-[10px] text-zinc-500 font-mono">{loan.whatsapp || 'Sem WhatsApp'}</p>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-[10px] font-black uppercase">
                                        {overdue.length} Parcelas
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-zinc-900 dark:text-zinc-100 font-black">
                                      R$ {totalOverdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell>
                                      <Button 
                                        size="sm" 
                                        variant="outline" 
                                        className="gap-2 h-8 text-[10px] font-bold uppercase shadow-[0_2px_0_0_rgba(0,0,0,0.05)] active:shadow-none active:translate-y-[2px]"
                                        onClick={() => {
                                          const msg = getWhatsAppMessage(loan);
                                          window.open(`https://wa.me/${loan.whatsapp?.replace(/\D/g, '')}?text=${msg}`, '_blank');
                                          addNotification("Cobrança Iniciada", `WhatsApp aberto para ${loan.client}`, "info");
                                        }}
                                      >
                                        <Send className="w-3 h-3" /> Cobrar
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Right Column: Bot Activity */}
                <div className="space-y-6">
                  <Card className="border-zinc-200 dark:border-zinc-800 bg-zinc-900 text-zinc-100 overflow-hidden shadow-xl">
                    <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-800/50">
                      <h2 className="font-bold flex items-center gap-2 text-xs uppercase tracking-widest">
                        <Bot className="w-4 h-4 text-emerald-400" />
                        Console do Bot
                      </h2>
                      <div className="flex items-center gap-3">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className={cn(
                                "h-7 text-[9px] font-bold uppercase border-zinc-700 hover:bg-zinc-800",
                                isWhatsAppSynced ? "text-emerald-400 border-emerald-500/30" : "text-zinc-400"
                              )}
                            >
                              {isWhatsAppSynced ? "WhatsApp Conectado" : "Sincronizar WhatsApp"}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                            <DialogHeader>
                              <DialogTitle className="text-center font-serif italic text-2xl">Sincronizar WhatsApp</DialogTitle>
                            </DialogHeader>
                            <div className="flex flex-col items-center justify-center py-6 space-y-6">
                              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-xl w-full text-center">
                                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest flex items-center justify-center gap-2">
                                  <AlertCircle className="w-3 h-3" /> 
                                  Ambiente de Demonstração
                                </p>
                                <p className="text-[9px] text-amber-600 dark:text-amber-500 mt-1">
                                  Esta é uma simulação de interface. Para produção, integramos com APIs oficiais (Twilio/Z-API).
                                </p>
                              </div>

                              <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-full max-w-[320px]">
                                <button 
                                  onClick={() => setSyncMethod('qr')}
                                  className={cn(
                                    "flex-1 py-1.5 text-[9px] font-bold uppercase rounded-md transition-all",
                                    syncMethod === 'qr' ? "bg-white dark:bg-zinc-700 shadow-sm text-emerald-600" : "text-zinc-500"
                                  )}
                                >
                                  QR Code
                                </button>
                                <button 
                                  onClick={() => setSyncMethod('code')}
                                  className={cn(
                                    "flex-1 py-1.5 text-[9px] font-bold uppercase rounded-md transition-all",
                                    syncMethod === 'code' ? "bg-white dark:bg-zinc-700 shadow-sm text-emerald-600" : "text-zinc-500"
                                  )}
                                >
                                  Código
                                </button>
                                <button 
                                  onClick={() => setSyncMethod('direct')}
                                  className={cn(
                                    "flex-1 py-1.5 text-[9px] font-bold uppercase rounded-md transition-all",
                                    syncMethod === 'direct' ? "bg-white dark:bg-zinc-700 shadow-sm text-emerald-600" : "text-zinc-500"
                                  )}
                                >
                                  Direto (Demo)
                                </button>
                              </div>

                              <div className="relative p-6 bg-white rounded-3xl shadow-2xl border border-zinc-100">
                                {isWhatsAppSynced ? (
                                  <div className="w-56 h-56 flex flex-col items-center justify-center text-emerald-600 space-y-3">
                                    <div className="relative">
                                      <CheckCircle2 className="w-20 h-20" />
                                      <motion.div 
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center"
                                      >
                                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                                      </motion.div>
                                    </div>
                                    <div className="text-center">
                                      <p className="font-bold text-base">Conectado</p>
                                      <p className="text-[10px] text-zinc-400 uppercase tracking-widest">Sessão Ativa</p>
                                      {phoneNumber && syncMethod === 'code' && (
                                        <p className="text-[10px] text-emerald-500 font-mono mt-1">{phoneNumber}</p>
                                      )}
                                    </div>
                                  </div>
                                ) : isConnecting ? (
                                  <div className="w-56 h-56 flex flex-col items-center justify-center space-y-4">
                                    <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                                    <p className="text-xs font-bold text-zinc-500 animate-pulse">Autenticando...</p>
                                  </div>
                                ) : syncMethod === 'qr' ? (
                                  <div 
                                    className="relative group cursor-pointer overflow-hidden rounded-3xl"
                                    onClick={() => setQrValue(`whatsapp-sync-${Math.random().toString(36).substr(2, 9)}`)}
                                  >
                                    <div className="p-6 bg-white rounded-3xl border-8 border-zinc-50 shadow-2xl relative">
                                      <QRCodeCanvas 
                                        value={qrValue}
                                        size={256}
                                        level="H"
                                        includeMargin={true}
                                        fgColor="#000000"
                                        bgColor="#ffffff"
                                      />
                                      
                                      {/* High-Precision Scanning Line Animation */}
                                      <motion.div 
                                        animate={{ top: ["0%", "100%", "0%"] }}
                                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                                        className="absolute left-0 right-0 h-1 bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)] z-10 pointer-events-none opacity-70"
                                      />
                                      
                                      {/* Enhanced Corner Accents */}
                                      <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-lg" />
                                      <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-lg" />
                                      <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-lg" />
                                      <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-lg" />
                                    </div>
                                    
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 bg-white/95 backdrop-blur-[4px] rounded-3xl z-20">
                                      <div className="text-center space-y-3">
                                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                                          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin-slow" />
                                        </div>
                                        <p className="text-xs font-bold text-zinc-800 uppercase tracking-widest">Atualizar QR Code</p>
                                        <p className="text-[10px] text-zinc-400">Garante maior precisão de leitura</p>
                                      </div>
                                    </div>
                                  </div>
                                ) : syncMethod === 'code' ? (
                                  <div className="w-72 h-72 flex flex-col items-center justify-center space-y-6 bg-zinc-50/50 dark:bg-zinc-800/20 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 p-4">
                                    {!pairingCode ? (
                                      <div className="space-y-4 w-full px-4">
                                        <div className="space-y-2">
                                          <label className="text-[10px] font-bold uppercase text-zinc-500 text-center block">Seu Número de WhatsApp</label>
                                          <Input 
                                            placeholder="+55 (00) 00000-0000" 
                                            className="h-10 text-center font-bold bg-white dark:bg-zinc-900"
                                            value={phoneNumber}
                                            onChange={(e) => {
                                              let val = e.target.value.replace(/\D/g, '');
                                              if (val.length > 11) val = val.slice(0, 11);
                                              
                                              // Simple mask: (00) 00000-0000
                                              let masked = val;
                                              if (val.length > 2) masked = `(${val.slice(0, 2)}) ${val.slice(2)}`;
                                              if (val.length > 7) masked = `(${val.slice(0, 2)}) ${val.slice(2, 7)}-${val.slice(7)}`;
                                              if (val.length > 0) masked = `+55 ${masked}`;
                                              
                                              setPhoneNumber(masked);
                                            }}
                                          />
                                        </div>
                                        <Button 
                                          className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold uppercase text-[10px] tracking-widest h-10"
                                          disabled={phoneNumber.replace(/\D/g, '').length < 12} // +55 + 11 digits
                                          onClick={() => {
                                            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                                            let code = "";
                                            for (let i = 0; i < 8; i++) {
                                              code += chars.charAt(Math.floor(Math.random() * chars.length));
                                            }
                                            setPairingCode(code);
                                          }}
                                        >
                                          Gerar Código
                                        </Button>
                                        <p className="text-[9px] text-zinc-400 text-center italic">Digite seu número com DDD para gerar o código.</p>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="grid grid-cols-4 gap-2">
                                          {pairingCode.split('').map((char, i) => (
                                            <motion.div 
                                              key={i} 
                                              initial={{ scale: 0.8, opacity: 0 }}
                                              animate={{ scale: 1, opacity: 1 }}
                                              transition={{ delay: i * 0.05 }}
                                              className="w-12 h-14 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center font-mono font-bold text-xl text-emerald-600 shadow-lg"
                                            >
                                              {char}
                                            </motion.div>
                                          ))}
                                        </div>
                                        <div className="text-center space-y-2">
                                          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Código de Pareamento</p>
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="text-[9px] h-6 text-zinc-400 hover:text-emerald-500"
                                            onClick={() => setPairingCode("")}
                                          >
                                            Alterar Número
                                          </Button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-72 h-72 flex flex-col items-center justify-center space-y-6 bg-zinc-50/50 dark:bg-zinc-800/20 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 p-6">
                                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                                      <Bot className="w-8 h-8 text-emerald-600" />
                                    </div>
                                    <div className="text-center space-y-2">
                                      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Conexão Direta de Teste</p>
                                      <p className="text-[10px] text-zinc-500">Pule a sincronização e ative o bot imediatamente para testar as funcionalidades.</p>
                                    </div>
                                    <Button 
                                      className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold uppercase text-[10px] tracking-widest"
                                      onClick={() => {
                                        setIsConnecting(true);
                                        setTimeout(() => {
                                          setIsConnecting(false);
                                          setIsWhatsAppSynced(true);
                                        }, 1000);
                                      }}
                                    >
                                      Ativar Agora
                                    </Button>
                                  </div>
                                )}
                              </div>

                              <div className="text-center space-y-4 max-w-xs">
                                {!isWhatsAppSynced && !isConnecting && (
                                  <div className="flex flex-col items-center gap-2">
                                    <div className="flex items-center gap-2 text-emerald-600 animate-pulse">
                                      <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                                      <span className="text-xs font-bold uppercase tracking-widest">Aguardando leitura...</span>
                                    </div>
                                    <div className="flex gap-1">
                                      {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className="w-8 h-1 bg-zinc-100 rounded-full overflow-hidden">
                                          <motion.div 
                                            animate={{ x: ["-100%", "100%"] }}
                                            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                                            className="w-full h-full bg-emerald-500/30"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed px-4">
                                  {isWhatsAppSynced 
                                    ? "Seu WhatsApp está sincronizado com o Loy Gestor. O bot agora pode enviar mensagens automáticas." 
                                    : syncMethod === 'qr' 
                                      ? "Aponte a câmera do seu WhatsApp para este código para conectar instantaneamente com alta precisão."
                                      : "No WhatsApp, vá em Aparelhos Conectados > Conectar com número de telefone e insira o código acima."}
                                </p>
                              </div>

                              <div className="w-full space-y-2">
                                <Button 
                                  className={cn(
                                    "w-full font-bold uppercase tracking-widest h-11 rounded-xl shadow-lg transition-all active:scale-95",
                                    isWhatsAppSynced ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
                                  )}
                                  onClick={() => {
                                    if (isWhatsAppSynced) {
                                      setIsWhatsAppSynced(false);
                                    } else {
                                      setIsConnecting(true);
                                      setTimeout(() => {
                                        setIsConnecting(false);
                                        setIsWhatsAppSynced(true);
                                      }, 2000);
                                    }
                                  }}
                                  disabled={isConnecting}
                                >
                                  {isConnecting ? "Conectando..." : isWhatsAppSynced ? "Desconectar WhatsApp" : "Simular Conexão"}
                                </Button>
                                <p className="text-[9px] text-center text-zinc-400 uppercase tracking-tighter">
                                  Conexão criptografada de ponta a ponta
                                </p>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>

                        {botActive && (
                          <div className="flex gap-1">
                            <span className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                            <span className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                            <span className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                          </div>
                        )}
                      </div>
                    </div>
                    <CardContent className="p-0">
                      <div className="h-[400px] overflow-y-auto p-4 space-y-3 font-mono text-[10px]">
                        {!botActive && botLogs.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-2">
                            <BotOff className="w-8 h-8 opacity-20" />
                            <p>Bot desativado no momento.</p>
                          </div>
                        )}
                        {botLogs.map(log => (
                          <motion.div 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={log.id} 
                            className={cn(
                              "border-l-2 pl-3 py-1",
                              log.type === 'success' ? "border-emerald-500 text-emerald-400" : 
                              log.type === 'warning' ? "border-amber-500 text-amber-400" : "border-zinc-700 text-zinc-400"
                            )}
                          >
                            <span className="opacity-50 mr-2">[{log.time}]</span>
                            {log.message}
                          </motion.div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-zinc-200 dark:border-zinc-800">
                    <CardContent className="p-6 space-y-6">
                      <h3 className="font-bold text-sm uppercase tracking-widest flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        Configurações do Bot
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-500">ID do Bot Pessoal</label>
                          <div className="flex gap-2">
                            <Input 
                              placeholder="Ex: 123456789:ABCDEF..." 
                              className="h-10 text-xs font-mono"
                              value={personalBotId}
                              onChange={(e) => setPersonalBotId(e.target.value)}
                            />
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-10 px-3"
                              onClick={() => {
                                addNotification("Configuração Salva", "ID do Bot Pessoal atualizado com sucesso.", "success");
                                setBotLogs(prev => [{
                                  id: Date.now().toString(),
                                  message: "Token da API do Bot Pessoal atualizado.",
                                  time: new Date().toLocaleTimeString('pt-BR'),
                                  type: 'info'
                                }, ...prev]);
                              }}
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                          </div>
                          <p className="text-[9px] text-zinc-400 italic">Insira o Token da API do seu bot pessoal para integração direta.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase text-zinc-500 flex justify-between">
                              Frequência
                              <select 
                                value={botFrequencyUnit} 
                                onChange={(e) => setBotFrequencyUnit(e.target.value as 'seconds' | 'days')}
                                className="bg-transparent border-none text-[10px] font-black text-primary-500 cursor-pointer focus:ring-0 p-0"
                              >
                                <option value="seconds">Segundos</option>
                                <option value="days">Dias</option>
                              </select>
                            </label>
                            <input 
                              type="number" 
                              min="1" 
                              max={botFrequencyUnit === 'seconds' ? 3600 : 30} 
                              value={botFrequency}
                              onChange={(e) => setBotFrequency(parseInt(e.target.value))}
                              className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg p-2 text-xs font-bold"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Atraso Mín. (dias)</label>
                            <input 
                              type="number" 
                              min="0" 
                              max="30" 
                              value={botMinDelay}
                              onChange={(e) => setBotMinDelay(parseInt(e.target.value))}
                              className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg p-2 text-xs font-bold"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-500">Dias de Operação</label>
                          <div className="flex flex-wrap gap-1">
                            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  if (botOperatingDays.includes(idx)) {
                                    setBotOperatingDays(botOperatingDays.filter(d => d !== idx));
                                  } else {
                                    setBotOperatingDays([...botOperatingDays, idx]);
                                  }
                                }}
                                className={cn(
                                  "w-7 h-7 rounded-md text-[10px] font-bold transition-all",
                                  botOperatingDays.includes(idx) 
                                    ? "bg-emerald-600 text-white" 
                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                                )}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-500">Horário de Operação</label>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              min="0" 
                              max="23" 
                              value={botStartHour}
                              onChange={(e) => setBotStartHour(parseInt(e.target.value))}
                              className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg p-2 text-xs font-bold"
                            />
                            <span className="text-zinc-400">às</span>
                            <input 
                              type="number" 
                              min="0" 
                              max="23" 
                              value={botEndHour}
                              onChange={(e) => setBotEndHour(parseInt(e.target.value))}
                              className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg p-2 text-xs font-bold"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-500">Modelo da Mensagem</label>
                          <textarea 
                            ref={botTemplateRef}
                            value={botMessageTemplate}
                            onChange={(e) => setBotMessageTemplate(e.target.value)}
                            rows={4}
                            className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg p-3 text-xs leading-relaxed resize-none focus:ring-2 ring-emerald-500/20"
                            placeholder="Use as variáveis abaixo para personalizar sua mensagem."
                          />
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {[
                              { tag: '{cliente}', label: 'Nome' },
                              { tag: '{parcelas}', label: 'Qtd. Parcelas' },
                              { tag: '{valor}', label: 'Total Devido' },
                              { tag: '{vencimento}', label: 'Data Venc.' },
                              { tag: '{empresa}', label: 'Empresa' }
                            ].map(item => (
                              <button 
                                key={item.tag} 
                                onClick={() => insertTag(item.tag)}
                                className="text-[9px] bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-2 py-1 rounded text-zinc-600 dark:text-zinc-400 font-mono transition-colors border border-zinc-200 dark:border-zinc-700"
                                title={`Inserir ${item.label}`}
                              >
                                {item.tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2">
                        <p className="text-[9px] text-zinc-400 italic leading-tight">
                          * O bot simula o envio automático. Variáveis entre chaves serão substituídas pelos dados reais do cliente durante o envio.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-4xl font-black tracking-tighter text-zinc-900 dark:text-zinc-100 flex items-center gap-3 italic">
                    <Archive className="w-10 h-10 text-amber-500" />
                    ARQUIVO HISTÓRICO
                  </h1>
                  <p className="text-zinc-500 dark:text-zinc-400 font-mono text-xs uppercase tracking-[0.3em]">Memória de Operações & Clientes Inativos</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                   <motion.div 
                     initial={{ opacity: 0, x: 20 }}
                     animate={{ opacity: 1, x: 0 }}
                     className="bg-emerald-900/40 text-emerald-400 px-6 py-3 rounded-xl font-mono text-4xl font-black border border-emerald-800/50 shadow-2xl flex items-center gap-4 italic tracking-tighter"
                   >
                     <TrendingUp className="w-10 h-10 animate-pulse" />
                     LUCRO TOTAL: R$ {archivedLoans.reduce((acc, loan) => acc + (loan.installmentValue * loan.installments - loan.amount), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                   </motion.div>
                   <div className="bg-zinc-900 text-white px-6 py-3 rounded-xl font-mono text-4xl font-black border border-zinc-700 shadow-2xl italic tracking-tighter">
                     TOTAL ARQUIVADO: {archivedLoans.length}
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {archivedLoans.length === 0 ? (
                  <div className="col-span-full py-24 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
                    <Archive className="w-16 h-16 text-zinc-200 dark:text-zinc-800 mx-auto mb-4 opacity-20" />
                    <p className="text-zinc-400 dark:text-zinc-600 font-bold uppercase tracking-widest">Nenhum registro no arquivo</p>
                  </div>
                ) : (
                  archivedLoans.map((loan) => {
                    const totalPaid = loan.schedule.filter(s => s.paid).reduce((acc, curr) => acc + curr.payment, 0);
                    const totalExpected = loan.installmentValue * loan.installments;
                    const profit = totalExpected - loan.amount;
                    
                    return (
                      <Card key={loan.id} className="bg-zinc-950 border-zinc-800 group hover:border-amber-500/50 transition-all duration-500 overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-opacity">
                           <Archive className="w-12 h-12 text-zinc-800" />
                        </div>
                        <CardContent className="p-6">
                          <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                              {loan.photo ? (
                                <img src={loan.photo} alt={loan.client} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                              ) : (
                                <User className="w-6 h-6 text-zinc-700" />
                              )}
                            </div>
                            <div>
                              <h3 className="text-xl font-black text-white tracking-tight">{loan.client}</h3>
                              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{loan.whatsapp || 'Sem Contato'}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
                              <p className="text-[9px] font-bold text-zinc-500 uppercase mb-1">Investido</p>
                              <p className="text-sm font-black text-zinc-300">R$ {loan.amount.toLocaleString('pt-BR')}</p>
                            </div>
                            <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
                              <p className="text-[9px] font-bold text-zinc-500 uppercase mb-1">Retorno Total</p>
                              <p className="text-sm font-black text-emerald-500">R$ {totalPaid.toLocaleString('pt-BR')}</p>
                            </div>
                            <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
                              <p className="text-[9px] font-bold text-zinc-500 uppercase mb-1">Lucro Líquido</p>
                              <p className="text-sm font-black text-amber-500">R$ {profit.toLocaleString('pt-BR')}</p>
                            </div>
                            <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
                              <p className="text-[9px] font-bold text-zinc-500 uppercase mb-1">Parcelas</p>
                              <p className="text-sm font-black text-zinc-300">{loan.installments}x {loan.type === 'interest-only' ? '(Juros)' : ''}</p>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1 h-9 bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 text-[10px] font-bold uppercase tracking-widest"
                              onClick={() => unarchiveLoan(loan.id)}
                            >
                              <RefreshCw className="w-3 h-3 mr-2" /> Restaurar
                            </Button>
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              className="h-9 w-9 p-0 bg-zinc-900 border-zinc-800 hover:bg-rose-900/50 text-rose-500"
                              onClick={() => setArchivedLoans(prev => prev.filter(l => l.id !== loan.id))}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </main>

        <footer className="py-12 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="container mx-auto px-4 text-center text-zinc-500 text-sm">
            <p>&copy; 2026 Loy Gestor Financial Systems. Todos os direitos reservados.</p>
          </div>
        </footer>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-800 px-6 py-4 h-20 touch-none">
          <div className="flex items-center justify-between max-w-md mx-auto h-full">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "flex flex-col items-center justify-center gap-1 transition-all w-12 h-12",
                activeTab === 'dashboard' ? "text-primary-600 dark:text-primary-400 scale-110" : "text-zinc-400"
              )}
            >
              <TrendingUp className={cn("w-6 h-6", activeTab === 'dashboard' && "animate-bounce")} />
              <span className="text-[8px] font-black uppercase tracking-widest">Início</span>
            </button>
            <button 
              onClick={() => setActiveTab('financeiro')}
              className={cn(
                "flex flex-col items-center justify-center gap-1 transition-all w-12 h-12",
                activeTab === 'financeiro' ? "text-primary-600 dark:text-primary-400 scale-110" : "text-zinc-400"
              )}
            >
              <Wallet className={cn("w-6 h-6", activeTab === 'financeiro' && "animate-bounce")} />
              <span className="text-[8px] font-black uppercase tracking-widest">Caixa</span>
            </button>
            <button 
              onClick={() => setActiveTab('cobrancas')}
              className={cn(
                "flex flex-col items-center justify-center gap-1 transition-all w-12 h-12",
                activeTab === 'cobrancas' ? "text-primary-600 dark:text-primary-400 scale-110" : "text-zinc-400"
              )}
            >
              <Bot className={cn("w-6 h-6", activeTab === 'cobrancas' && "animate-bounce")} />
              <span className="text-[8px] font-black uppercase tracking-widest">Bot</span>
            </button>
            <button 
              onClick={() => setActiveTab('arquivados')}
              className={cn(
                "flex flex-col items-center justify-center gap-1 transition-all w-12 h-12",
                activeTab === 'arquivados' ? "text-primary-600 dark:text-primary-400 scale-110" : "text-zinc-400"
              )}
            >
              <Archive className={cn("w-6 h-6", activeTab === 'arquivados' && "animate-bounce")} />
              <span className="text-[8px] font-black uppercase tracking-widest">Arquivo</span>
            </button>
            <Dialog>
              <DialogTrigger asChild>
                <button className="flex flex-col items-center justify-center gap-1 text-zinc-400 w-12 h-12">
                  <Settings className="w-6 h-6" />
                  <span className="text-[8px] font-black uppercase tracking-widest">Ajustes</span>
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                <DialogHeader>
                  <DialogTitle className="text-center font-serif italic text-2xl">Configurações</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tema do Sistema</p>
                    <ThemeSwitcher currentTheme={theme} onThemeChange={setTheme} />
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Modo de Exibição</p>
                    <div className="flex gap-2">
                      <Button 
                        variant={!darkMode ? "default" : "outline"} 
                        className="flex-1 h-12 gap-2 font-bold uppercase text-[10px] tracking-widest"
                        onClick={() => setDarkMode(false)}
                      >
                        <Sun className="w-4 h-4" /> Claro
                      </Button>
                      <Button 
                        variant={darkMode ? "default" : "outline"} 
                        className="flex-1 h-12 gap-2 font-bold uppercase text-[10px] tracking-widest"
                        onClick={() => setDarkMode(true)}
                      >
                        <Moon className="w-4 h-4" /> Escuro
                      </Button>
                    </div>
                  </div>
                  <Button variant="ghost" className="w-full h-12 text-rose-500 font-bold uppercase text-[10px] tracking-widest" onClick={logout}>
                    <LogOut className="w-4 h-4 mr-2" /> Sair do Sistema
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    );
}
