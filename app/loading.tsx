
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading Chaudhary General Store"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-white px-4"
    >
      {/* Loading Spinner */}
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-4 border-green-100" />

        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#159B4A]" />
      </div>

      {/* Loading Text */}
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700">
          Loading...
        </p>

        <p className="mt-1 text-xs text-gray-400">
          Chaudhary General Store
        </p>
      </div>
    </div>
  );
}
