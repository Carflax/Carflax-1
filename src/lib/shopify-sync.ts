/**
 * Serviço de sincronização em tempo real das imagens de produtos da Shopify.
 * Usa proxy (/shopify-api/) para evitar o bloqueio de CORS do browser.
 * Em dev: vite.config.ts proxy → https://gfpdzv-y0.myshopify.com
 * Em produção: vercel.json rewrite → https://gfpdzv-y0.myshopify.com
 */

const SHOPIFY_TOKEN = import.meta.env.VITE_SHOPIFY_API_TOKEN as string;

// Usa proxy relativo para contornar CORS (Shopify Admin API não permite chamadas diretas do browser)
const SHOPIFY_PROXY = "/shopify-api";

let shopifyPhotoCache: Map<string, string> | null = null;
let fetchPromise: Promise<Map<string, string>> | null = null;

export async function getShopifyPhotoMap(): Promise<Map<string, string>> {
  if (shopifyPhotoCache) return shopifyPhotoCache;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    const skuMap = new Map<string, string>();
    try {
      let url: string | null = `${SHOPIFY_PROXY}/admin/api/2024-01/products.json?limit=250`;
      let pages = 0;

      while (url && pages < 50) {
        pages++;
        const res = await fetch(url, {
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": SHOPIFY_TOKEN,
          },
        });

        if (!res.ok) break;

        const data = (await res.json()) as {
          products?: Array<{
            id: number;
            title: string;
            image?: { src?: string };
            images?: Array<{ src?: string }>;
            variants?: Array<{ sku?: string }>;
          }>;
        };

        if (!data.products || data.products.length === 0) break;

        for (const p of data.products) {
          const imgSrc = p.image?.src || p.images?.[0]?.src;
          if (!imgSrc || !p.variants) continue;

          for (const v of p.variants) {
            if (v.sku) {
              const rawSku = String(v.sku).trim();
              const cleanSku = rawSku.replace(/^0+/, "");
              skuMap.set(rawSku, imgSrc);
              skuMap.set(cleanSku, imgSrc);
              // Mapeia também com zeros à esquerda no formato 5 dígitos (ex: 00329)
              const paddedSku = rawSku.padStart(5, "0");
              skuMap.set(paddedSku, imgSrc);
            }
          }
        }

        const linkHeader = res.headers.get("link");
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const parts = linkHeader.split(",");
          const nextPart = parts.find((pt) => pt.includes('rel="next"'));
          if (nextPart) {
            const start = nextPart.indexOf("<") + 1;
            const end = nextPart.indexOf(">");
            // O link retornado pela Shopify é absoluto – substitui o host pelo proxy
            const absUrl = start > 0 && end > start ? nextPart.substring(start, end) : null;
            url = absUrl ? absUrl.replace(/^https?:\/\/[^/]+/, SHOPIFY_PROXY) : null;
          } else {
            url = null;
          }
        } else {
          url = null;
        }
      }
      shopifyPhotoCache = skuMap;
    } catch (e) {
      console.error("Erro ao sincronizar imagens da Shopify:", e);
    }
    return skuMap;
  })();

  return fetchPromise;
}
