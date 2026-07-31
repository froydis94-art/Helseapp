import * as FileSystem from "expo-file-system";
import { API_BASE_URL } from "../config";

function guessMimeType(uri) {
  const lower = uri.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function generateFutureYou({ imageUri, maal, intensity = "moderate" }) {
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const response = await fetch(`${API_BASE_URL}/api/generate-future-you`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      maal,
      intensity,
      imageBase64: base64,
      mimeType: guessMimeType(imageUri),
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `API-feil (${response.status})`);
  }

  if (result.imageBase64) {
    return {
      uri: `data:image/png;base64,${result.imageBase64}`,
      disclaimer: result.disclaimer,
    };
  }

  if (result.imageUrl) {
    return { uri: result.imageUrl, disclaimer: result.disclaimer };
  }

  throw new Error("Serveren returnerte ikke et bilde.");
}
