"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ImagePlus } from "lucide-react";

export function ImageUploader({
  value,
  onUploaded,
  pathPrefix,
  aspectClassName = "aspect-video",
}: {
  value: string | null;
  onUploaded: (url: string) => void | Promise<void>;
  pathPrefix: string;
  aspectClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB.");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from("course-thumbnails").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) {
      setUploading(false);
      setError("Upload failed. Please try again.");
      return;
    }

    const { data } = supabase.storage.from("course-thumbnails").getPublicUrl(path);
    await onUploaded(data.publicUrl);
    setUploading(false);
  }

  return (
    <div>
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-dashed border-ink-200 bg-ink-50 ${aspectClassName}`}
      >
        {value ? (
          <Image src={value} alt="" fill className="object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-ink-400">
            <ImagePlus className="h-6 w-6" />
            <span className="text-xs">No image</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        loading={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {value ? "Replace image" : "Upload image"}
      </Button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
