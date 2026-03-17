import { useEffect, useState } from "react";
import { ipfsToHttp } from "@/utils/pinata";

export interface TokenMetadata {
  name?: string;
  description?: string;
  image?: string;
  imageHttp?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
}

const cache = new Map<string, TokenMetadata>();

export function useTokenMetadata(tokenURI: string | undefined): {
  metadata: TokenMetadata | null;
  isLoading: boolean;
  error: string | null;
} {
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenURI) return;

    const cached = cache.get(tokenURI);
    if (cached) {
      setMetadata(cached);
      return;
    }

    const httpURL = ipfsToHttp(tokenURI);
    if (!httpURL) return;

    setIsLoading(true);
    setError(null);

    fetch(httpURL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<TokenMetadata>;
      })
      .then((data) => {
        const enriched: TokenMetadata = {
          ...data,
          imageHttp: data.image ? ipfsToHttp(data.image) : undefined,
        };
        cache.set(tokenURI, enriched);
        setMetadata(enriched);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load metadata");
      })
      .finally(() => setIsLoading(false));
  }, [tokenURI]);

  return { metadata, isLoading, error };
}
