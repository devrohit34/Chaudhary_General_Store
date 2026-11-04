import Image from 'next/image';

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading Chaudhary General Store"
      className="flex min-h-screen items-center justify-center bg-white p-4"
    >
      <Image
        src="/icons/loading-screen.png"
        alt=""
        width={1254}
        height={1254}
        priority
        sizes="(max-width: 768px) 100vw, 672px"
        className="h-auto w-full max-w-2xl"
      />
    </div>
  );
}
