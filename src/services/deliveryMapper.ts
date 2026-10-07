import { Delivery, DeliveryStatus } from "../../types";

/**
 * Define a estrutura das colunas esperadas da query SQL da rota /entregas/:codMotorista
 * Baseado em ZH_STATUS, ZB_NUMSEQ, ZB_END, ZB_BAIRRO, etc.
 */
interface BackendDelivery {
  ZB_NUMSEQ: string;
  ZB_NOMCLI: string;
  ZB_END: string;
  ZB_BAIRRO: string;
  ZB_NOTA: string;
  ZH_STATUS: string;
  ZH_FOTO_URL: string | null;
  chegada_em: string | null;
  // Adicione ZH_MOTOR, ZH_CODIGO, ZB_DTENTRE, etc., se forem usados no futuro
}

// Mapeador de Status do Banco de Dados para o Enum do Frontend
const mapStatus = (status: string): DeliveryStatus => {
  const s = status.toUpperCase();
  if (s === "CONCLUIDA" || s === "FINALIZADO") {
    return DeliveryStatus.COMPLETED;
  }
  if (s === "NÃO ENTREGUE" || s === "FALHA" || s === "FAILED") {
    return DeliveryStatus.FAILED;
  }
  // Assumimos PENDENTE se não houver outra informação
  return DeliveryStatus.PENDING;
};

// Função principal de mapeamento de um único item
const mapDeliveryFromBackend = (data: BackendDelivery): Delivery => {
  return {
    // Mapeamento de Colunas (SQL -> Frontend)
    id: data.ZB_NUMSEQ, // ZB_NUMSEQ é o identificador único da entrega
    customerName: data.ZB_NOMCLI,
    address: data.ZB_END,
    district: data.ZB_BAIRRO,
    billId: data.ZB_NOTA, // Nota fiscal
    bilhete: data.ZB_NUMSEQ, // Número do bilhete (ZB_NUMSEQ)
    note: "", // Se a nota (ZB_OBS) não for retornada, mantemos vazio

    // Mapeamento de Status
    status: mapStatus(data.ZH_STATUS),
    imageUrl: data.ZH_FOTO_URL || undefined,
    arrivalTime: data.chegada_em || undefined,
  };
};

// Mapeador auxiliar para transformar o array completo
export const mapDeliveriesArray = (dataArray: any): Delivery[] => {
  if (!Array.isArray(dataArray)) {
    console.error("Dados de entrega inválidos. Esperado array.");
    return [];
  }
  // Usamos o mapeador item a item
  return dataArray.map(mapDeliveryFromBackend);
};
