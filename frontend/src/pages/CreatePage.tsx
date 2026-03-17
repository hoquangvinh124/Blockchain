import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, usePublicClient, useReadContract, useSignMessage } from "wagmi";
import { parseEther } from "viem";
import { toast } from "sonner";
import {
  Plus, Layers, Package, Tag, Trash2, UserCircle, Loader2,
  ImageOff, ArrowRight, ArrowLeft,
} from "lucide-react";

import { useMySets } from "@/hooks/useCollectionData";
import { useCollectionActions } from "@/hooks/useCollectionActions";
import { contracts } from "@/config/contracts";
import { uploadFileToIPFS, uploadJSONToIPFS } from "@/utils/pinata";
import { SIGN_MESSAGE, getPublicKeyBase64 } from "@/utils/encrypt";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = "type" | "set" | "details";
type TokenType = "normal" | "phygital";

interface TraitInput {
  key: string;
  value: string;
}

export default function CreatePage() {
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();
  const publicClient = usePublicClient();
  const { mySets } = useMySets();
  const actions = useCollectionActions();
  const { signMessageAsync } = useSignMessage();

  const [step, setStep] = useState<Step>("type");
  const [tokenType, setTokenType] = useState<TokenType>("normal");

  // Set selection
  const [createNewSet, setCreateNewSet] = useState(true);
  const [selectedSetId, setSelectedSetId] = useState("");
  const [newSetName, setNewSetName] = useState("");
  const [newSetDescription, setNewSetDescription] = useState("");
  const [newSetSymbol, setNewSetSymbol] = useState("");
  const [newSetImage, setNewSetImage] = useState<File | null>(null);
  const [newSetImagePreview, setNewSetImagePreview] = useState<string | null>(null);

  // Token details
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [traits, setTraits] = useState<TraitInput[]>([{ key: "", value: "" }]);

  // Phygital-specific
  const [redeemStart, setRedeemStart] = useState("");
  const [redeemEnd, setRedeemEnd] = useState("");

  // Encryption key for phygital shipping (checked in handleSubmit)
  const { data: existingPubkey } = useReadContract({
    address: contracts.phygitalEscrow.address,
    abi: contracts.phygitalEscrow.abi,
    functionName: "sellerEncryptionPubkeys",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address && tokenType === "phygital" },
  });
  const hasEncKey = typeof existingPubkey === "string" && existingPubkey.length > 0;

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImageChange = (file: File | null, isSetImage = false) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      if (isSetImage) {
        setNewSetImage(file);
        setNewSetImagePreview(url);
      } else {
        setImage(file);
        setImagePreview(url);
      }
    };
    reader.readAsDataURL(file);
  };

  const addTrait = () => {
    if (traits.length >= 20) return;
    setTraits([...traits, { key: "", value: "" }]);
  };
  const removeTrait = (i: number) => setTraits(traits.filter((_, idx) => idx !== i));
  const updateTrait = (i: number, field: "key" | "value", val: string) => {
    const next = [...traits];
    next[i] = { ...next[i], [field]: val };
    setTraits(next);
  };

  if (!isConnected) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <UserCircle className="size-14 text-zinc-600" />
        <h2 className="text-xl font-bold text-white">Wallet Not Connected</h2>
        <p className="text-zinc-400">Connect your wallet to create NFTs.</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      // Upload token image
      if (!image) {
        toast.error("NFT image is required.");
        return;
      }
      const imageURI = await uploadFileToIPFS(image);

      // Build token metadata
      const tokenMeta: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        image: imageURI,
      };
      const filteredTraits = traits.filter((t) => t.key.trim() && t.value.trim());
      if (filteredTraits.length > 0) {
        tokenMeta.attributes = filteredTraits.map((t) => ({ trait_type: t.key, value: t.value }));
      }
      const tokenURI = await uploadJSONToIPFS(tokenMeta);

      const priceWei = parseEther(price || "0");
      if (priceWei === 0n) {
        toast.error("Price must be greater than 0.");
        return;
      }

      // Phygital redeem window validation
      if (tokenType === "phygital") {
        if (!redeemStart || !redeemEnd) {
          toast.error("Redeem window required", { description: "Please set both Redeem Window Start and End for phygital NFTs." });
          return;
        }
        const startTs = BigInt(Math.floor(new Date(redeemStart).getTime() / 1000));
        const endTs = BigInt(Math.floor(new Date(redeemEnd).getTime() / 1000));
        if (endTs <= startTs) {
          toast.error("Invalid redeem window", { description: "Redeem Window End must be after Start." });
          return;
        }
      }

      const traitData = filteredTraits.map((t) => ({ key: t.key.trim(), value: t.value.trim() }));

      // For phygital: sign off-chain to derive encryption key, pass inline to mint TX
      let encPubkey = "";
      if (tokenType === "phygital" && !hasEncKey) {
        const sig = await signMessageAsync({ message: SIGN_MESSAGE });
        encPubkey = getPublicKeyBase64(sig);
      }

      if (createNewSet) {
        // Build set metadata
        let setMetadataURI = "";
        if (newSetImage) {
          const imgURI = await uploadFileToIPFS(newSetImage);
          const meta: Record<string, unknown> = { name: newSetName.trim(), description: newSetDescription.trim(), image: imgURI };
          if (newSetSymbol.trim()) meta.symbol = newSetSymbol.trim().toUpperCase();
          setMetadataURI = await uploadJSONToIPFS(meta);
        } else {
          const meta: Record<string, unknown> = { name: newSetName.trim(), description: newSetDescription.trim() };
          if (newSetSymbol.trim()) meta.symbol = newSetSymbol.trim().toUpperCase();
          setMetadataURI = await uploadJSONToIPFS(meta);
        }

        // 1 TX: create set + mint token
        if (tokenType === "normal") {
          const txHash = await actions.createSetAndMintNormal(setMetadataURI, tokenURI, priceWei, traitData);
          toast.success("Collection + NFT created!", { description: `TX: ${txHash.slice(0, 20)}...` });
        } else {
          const start = BigInt(Math.floor(new Date(redeemStart!).getTime() / 1000));
          const end = BigInt(Math.floor(new Date(redeemEnd!).getTime() / 1000));
          const txHash = await actions.createSetAndMintPhygital(setMetadataURI, tokenURI, priceWei, start, end, traitData, encPubkey);
          toast.success("Collection + Phygital NFT created!", { description: `TX: ${txHash.slice(0, 20)}...` });
        }
      } else {
        if (!selectedSetId) {
          toast.error("Please select a collection.");
          return;
        }
        const setId = BigInt(selectedSetId);

        if (tokenType === "normal") {
          const txHash = await actions.mintNormal(setId, tokenURI, priceWei, traitData);
          toast.success("NFT minted!", { description: `TX: ${txHash.slice(0, 20)}...` });
        } else {
          const start = BigInt(Math.floor(new Date(redeemStart!).getTime() / 1000));
          const end = BigInt(Math.floor(new Date(redeemEnd!).getTime() / 1000));
          const txHash = await actions.mintPhygital(setId, tokenURI, priceWei, start, end, traitData, encPubkey);
          toast.success("Phygital NFT minted!", { description: `TX: ${txHash.slice(0, 20)}...` });
        }
      }

      void navigate("/app/explore");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Error", { description: msg.slice(0, 200) });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Current preview image (set or token depending on which step)
  const currentPreview = step === "set" ? (createNewSet ? newSetImagePreview : null) : imagePreview;
  const previewName = step === "set"
    ? (newSetName.trim() || "Collection Name")
    : (name.trim() || "NFT Name");
  const previewSymbol = newSetSymbol.trim() || null;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] gap-0">
      {/* Left: sticky image preview panel */}
      <div className="hidden lg:flex w-2/5 xl:w-1/3 shrink-0 flex-col items-center justify-center pr-10 sticky top-24 self-start">
        <div className="w-full max-w-xs space-y-4">
          <div className="aspect-square w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl">
            {currentPreview ? (
              <img src={currentPreview} alt="preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-900 to-zinc-800">
                <ImageOff className="size-12 text-zinc-700" />
                <p className="text-xs text-zinc-600">Upload an image to preview</p>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
            <p className="text-base font-bold text-white truncate">{previewName}</p>
            {previewSymbol && (
              <p className="mt-0.5 text-xs font-mono text-blue-400 uppercase">{previewSymbol}</p>
            )}
            <p className="mt-1 text-xs text-zinc-500 capitalize">{tokenType} · {address?.slice(0, 6)}...{address?.slice(-4)}</p>
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 space-y-8 pb-16">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {(["type", "set", "details"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={cn("h-px w-6", step === s || (step === "details" && i < 2) || (step !== "type" && i === 1) ? "bg-blue-500" : "bg-zinc-700")} />}
              <div className={cn("flex size-6 items-center justify-center rounded-full text-xs font-bold", step === s ? "bg-blue-600 text-white" : i < (["type", "set", "details"].indexOf(step)) ? "bg-zinc-700 text-zinc-300" : "bg-zinc-800 text-zinc-600")}>
                {i + 1}
              </div>
              <span className={cn("text-xs font-medium capitalize hidden sm:inline", step === s ? "text-white" : "text-zinc-500")}>{s}</span>
            </div>
          ))}
        </div>

        {/* Step 1: Token Type */}
        {step === "type" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">What are you creating?</h1>
              <p className="mt-1 text-sm text-zinc-400">Choose the type of NFT to mint.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["normal", "phygital"] as TokenType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTokenType(t)}
                  className={cn(
                    "rounded-2xl border p-6 text-left transition-all",
                    tokenType === t
                      ? "border-blue-500 bg-blue-950/30 ring-1 ring-blue-500"
                      : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600"
                  )}
                >
                  <div className={cn("mb-3 flex size-10 items-center justify-center rounded-xl", tokenType === t ? "bg-blue-600" : "bg-zinc-800")}>
                    {t === "normal" ? <Tag className="size-5 text-white" /> : <Package className="size-5 text-white" />}
                  </div>
                  <h3 className="font-bold text-white capitalize">{t === "normal" ? "Normal NFT" : "Phygital NFT"}</h3>
                  <p className="mt-1 text-xs text-zinc-400">
                    {t === "normal" ? "Digital collectible traded on the marketplace." : "Represents a physical item — redeemable in real life."}
                  </p>
                </button>
              ))}
            </div>
            <Button className="w-full" onClick={() => setStep("set")}>
              Continue <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        )}

        {/* Step 2: Collection (Set) */}
        {step === "set" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Select or Create Collection</h1>
              <p className="mt-1 text-sm text-zinc-400">Every NFT belongs to a collection (set).</p>
            </div>

            {/* Toggle */}
            <div className="flex rounded-xl border border-zinc-800 overflow-hidden">
              <button
                onClick={() => setCreateNewSet(true)}
                className={cn("flex-1 py-2.5 text-sm font-semibold transition-colors", createNewSet ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300")}
              >
                Create New
              </button>
              <button
                onClick={() => setCreateNewSet(false)}
                className={cn("flex-1 py-2.5 text-sm font-semibold transition-colors", !createNewSet ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300")}
              >
                Use Existing
              </button>
            </div>

            {createNewSet ? (
              <div className="space-y-4">
                <div className="field-group">
                  <label className="field-label">Collection Image</label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/60 p-4 hover:border-zinc-500 transition-colors">
                    <Layers className="size-8 shrink-0 text-zinc-600" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-300">{newSetImage ? newSetImage.name : "Upload collection cover"}</p>
                      <p className="text-xs text-zinc-600">PNG, JPG, GIF, SVG up to 50MB</p>
                    </div>
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleImageChange(e.target.files?.[0] ?? null, true)} />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="field-group">
                    <label className="field-label">Collection Name *</label>
                    <input className="field-input" placeholder="e.g. Cyber Artifacts" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} required />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Symbol (optional)</label>
                    <input className="field-input mono uppercase" placeholder="e.g. CYBA" maxLength={10} value={newSetSymbol} onChange={(e) => setNewSetSymbol(e.target.value.toUpperCase())} />
                    <p className="mt-1 text-[0.6rem] text-zinc-600">NFTs will be shown as {newSetSymbol.trim() || "SYMBOL"} #1, {newSetSymbol.trim() || "SYMBOL"} #2...</p>
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label">Description (optional)</label>
                  <textarea className="field-input min-h-[80px] resize-none" placeholder="Describe your collection..." value={newSetDescription} onChange={(e) => setNewSetDescription(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="field-group">
                <label className="field-label">Your Collections</label>
                {mySets.length === 0 ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-500">
                    You have no collections yet. Switch to "Create New" to make one.
                  </p>
                ) : (
                  <select className="field-input mono bg-zinc-900" value={selectedSetId} onChange={(e) => setSelectedSetId(e.target.value)} required>
                    <option value="" disabled>-- Select collection --</option>
                    {mySets.map((s) => (
                      <option key={s.id.toString()} value={s.id.toString()}>
                        Set #{s.id.toString()} — {s.tokenCount.toString()} NFTs
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("type")}>
                <ArrowLeft className="mr-2 size-4" /> Back
              </Button>
              <Button
                className="flex-1"
                disabled={createNewSet ? !newSetName.trim() : !selectedSetId}
                onClick={() => setStep("details")}
              >
                Continue <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: NFT Details */}
        {step === "details" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">NFT Details</h1>
              <p className="mt-1 text-sm text-zinc-400">Fill in the metadata for your NFT.</p>
            </div>

            {/* NFT image */}
            <div className="field-group">
              <label className="field-label">NFT Image *</label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/60 p-4 hover:border-zinc-500 transition-colors">
                <ImageOff className="size-8 shrink-0 text-zinc-600" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-300">{image ? image.name : "Upload NFT image"}</p>
                  <p className="text-xs text-zinc-600">PNG, JPG, GIF, SVG up to 50MB</p>
                </div>
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleImageChange(e.target.files?.[0] ?? null, false)} />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field-group">
                <label className="field-label">NFT Name *</label>
                <input className="field-input" placeholder="e.g. Cyber Artifact #001" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="field-group">
                <label className="field-label">Price (ETH)</label>
                <input className="field-input mono" type="number" min="0" step="0.001" placeholder="0.1" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Description (optional)</label>
              <textarea className="field-input min-h-[80px] resize-none" placeholder="Describe this NFT..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            {tokenType === "phygital" && (
              <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="field-group">
                  <label className="field-label">Redeem Window Start</label>
                  <input className="field-input" type="datetime-local" value={redeemStart} onChange={(e) => setRedeemStart(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Redeem Window End</label>
                  <input className="field-input" type="datetime-local" value={redeemEnd} onChange={(e) => setRedeemEnd(e.target.value)} />
                </div>
              </div>
            )}

            {/* Traits */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="field-label">Traits (optional)</label>
                <button onClick={addTrait} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  <Plus className="size-3.5" /> Add Trait
                </button>
              </div>
              {traits.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="field-input flex-1"
                    placeholder="Key (e.g. Color)"
                    value={t.key}
                    onChange={(e) => updateTrait(i, "key", e.target.value)}
                  />
                  <input
                    className="field-input flex-1"
                    placeholder="Value (e.g. Red)"
                    value={t.value}
                    onChange={(e) => updateTrait(i, "value", e.target.value)}
                  />
                  <button onClick={() => removeTrait(i)} className="text-zinc-600 hover:text-rose-400 transition-colors">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("set")}>
                <ArrowLeft className="mr-2 size-4" /> Back
              </Button>
              <Button
                className="flex-1 h-12"
                disabled={isSubmitting || actions.isPending || !name.trim() || !image}
                onClick={handleSubmit}
              >
                {isSubmitting ? (
                  <><Loader2 className="mr-2 size-4 animate-spin" /> Creating...</>
                ) : (
                  <>{tokenType === "normal" ? <Tag className="mr-2 size-4" /> : <Package className="mr-2 size-4" />} Mint {tokenType === "normal" ? "Normal" : "Phygital"} NFT</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}