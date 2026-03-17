const getJWT = (): string => {
  const jwt = import.meta.env.VITE_PINATA_JWT as string | undefined;
  if (!jwt) throw new Error("VITE_PINATA_JWT is missing from environment variables.");
  return jwt;
};

export const ipfsToHttp = (uri: string): string => {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    const hash = uri.slice(7);
    const gateway = (import.meta.env.VITE_PINATA_GATEWAY as string | undefined) || "gateway.pinata.cloud";
    return `https://${gateway}/ipfs/${hash}`;
  }
  return uri;
};

export const uploadFileToIPFS = async (file: File): Promise<string> => {
  const jwt = getJWT();

  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "pinataMetadata",
    JSON.stringify({ name: `TrustMarket_${Date.now()}_${file.name}` })
  );

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Pinata upload failed: ${response.status}`);
  }

  const data = (await response.json()) as { IpfsHash: string };
  return `ipfs://${data.IpfsHash}`;
};

export const uploadJSONToIPFS = async (jsonBody: Record<string, unknown>): Promise<string> => {
  const jwt = getJWT();

  const payload = {
    pinataContent: jsonBody,
    pinataMetadata: { name: `TrustMarket_Metadata_${Date.now()}.json` },
  };

  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Pinata upload failed: ${response.status}`);
  }

  const data = (await response.json()) as { IpfsHash: string };
  return `ipfs://${data.IpfsHash}`;
};
