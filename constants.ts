import { Delivery, DeliveryStatus, DriverStats } from './types';

export const CURRENT_DRIVER: DriverStats = {
  name: "Igo Santos Ferreira",
  totalDeliveries: 16,
  completed: 5,
  efficiency: 94
};

export const MOCK_DELIVERIES: Delivery[] = [
  {
    id: '000572016',
    customerName: 'Armazzem 1108 - Bela Vida',
    address: 'Rua Principal, 1108',
    district: 'Tapanã (Bengui, Pratinha)',
    note: 'Entregar nos fundos',
    billId: 'SALVQ3',
    status: DeliveryStatus.PENDING
  },
  {
    id: '000572102',
    customerName: 'Conve Cidade Jardim',
    address: 'Av. das Flores, SN',
    district: 'Cidade Jardim',
    note: 'Recebimento até as 14h',
    billId: 'SALVTQ',
    status: DeliveryStatus.PENDING
  },
  {
    id: '000572104',
    customerName: 'Mercadinho São José',
    address: 'Travessa da Estrela, 404',
    district: 'Bengui',
    note: 'Cuidado com cachorro',
    billId: 'SALVTY',
    status: DeliveryStatus.COMPLETED,
    imageUrl: 'https://picsum.photos/200/200'
  },
  {
    id: '000572105',
    customerName: 'Comércio do Michel',
    address: 'Rua da Paz, 55',
    district: 'Pratinha',
    note: '',
    billId: 'SALVU1',
    status: DeliveryStatus.PENDING
  },
  {
    id: '000572108',
    customerName: 'Chocolates Belem',
    address: 'Rodovia Augusto Montenegro',
    district: 'Parque Verde',
    note: 'Deixar na portaria',
    billId: 'SALVU3',
    status: DeliveryStatus.FAILED
  }
];