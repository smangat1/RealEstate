import Image from "next/image";

export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      className={className}
      src="/brand/homeboard-mark.svg"
      alt=""
      width={48}
      height={49}
      aria-hidden="true"
    />
  );
}
