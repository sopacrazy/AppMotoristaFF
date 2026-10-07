// NOTA: Estas chaves devem ser gerenciadas por variáveis de ambiente (Vite)
// para produção. Assumimos que elas são expostas no frontend para esta demo.
const CLOUD_NAME = "dalvrptgs";
const UPLOAD_PRESET = "ml_default";

/**
 * Envia um objeto File (capturado pela câmera/input) para o Cloudinary.
 * @param imageFile O objeto File ou Blob da imagem.
 * @returns A URL segura da imagem ou null em caso de falha.
 */
export const uploadImageToCloudinary = async (
  imageFile: File | Blob
): Promise<string | null> => {
  const uri = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  const formData = new FormData();
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("file", imageFile);
  formData.append("timestamp", String(Date.now() / 1000)); // Adiciona timestamp (opcional)

  try {
    const response = await fetch(uri, {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      const decodedData = await response.json();
      return decodedData.secure_url; // ✅ Retorna URL da imagem
    } else {
      const errorData = await response.json();
      console.error(
        "Erro ao enviar para Cloudinary:",
        response.status,
        errorData
      );
      return null;
    }
  } catch (e) {
    console.error("Erro na requisição para o Cloudinary:", e);
    return null;
  }
};
