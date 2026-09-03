export default function Loading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#F4F5F7]">
      <div className="flex flex-col items-center gap-4">
        {/* A simple spinning loader matching your app's theme */}
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black"></div>
        <p className="text-sm font-medium text-gray-500 animate-pulse">Aligning...</p>
      </div>
    </div>
  );
}