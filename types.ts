export enum DeliveryStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface Delivery {
  id: string;
  customerName: string;
  address: string;
  district: string; // Bairro
  note: string;
  billId: string; // Nota fiscal
  bilhete?: string; // Número do bilhete (ZB_NUMSEQ)
  status: DeliveryStatus;
  lat?: number;
  lng?: number;
  imageUrl?: string;
  arrivalTime?: string;
}

export interface OrderItem {
  codPro: string;
  desPro: string;
  qtde: number;
  preco: number;
  total: number;
}

export interface DriverStats {
  name: string;
  totalDeliveries: number;
  completed: number;
  efficiency: number;
}

export enum AppRoute {
  HOME = 'home',
  DELIVERIES = 'deliveries',
  HISTORY = 'history',
  REPORTS = 'reports',
  TRAFFIC = 'traffic',
  CHECKLIST = 'checklist',
  PROFILE = 'profile',
  MESSAGES = 'messages',
  DAILY_CONTROL = 'daily_control',
  DESPESAS = 'despesas'
}

export interface Badge {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  conquistado: boolean;
  conquistado_em?: string;
}

export interface BadgeFeedItem {
  nome_motorista: string;
  badge_name: string;
  icon: string;
  conquistado_em: string;
}