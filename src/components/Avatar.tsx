import { LocalizedLink as Link } from "./LocalizedLink";
// 다크 테마용 아바타 배경색 (채도 낮은 다크 팔레트)
const COLORS = [
  "bg-lime-900/40 text-lime-300",
  "bg-aqua-900/40 text-cyan-300",
  "bg-violet-900/40 text-violet-300",
  "bg-rose-900/40 text-rose-300",
  "bg-amber-900/40 text-amber-300",
  "bg-teal-900/40 text-teal-300",
  "bg-indigo-900/40 text-indigo-300",
];

function colorFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  userId?: string;
  className?: string;
}

const SIZES = {
  sm: "w-7 h-7 text-[length:var(--fs-xs)]",
  md: "w-9 h-9 text-[length:var(--fs-sm)]",
  lg: "w-12 h-12 text-[length:var(--fs-base)]",
  xl: "w-20 h-20 text-[length:var(--fs-2xl)]",
};

export default function Avatar({
  name,
  imageUrl,
  size = "md",
  userId,
  className = "",
}: AvatarProps) {
  const sizeClass = SIZES[size];
  const inner = imageUrl ? (
    <img
      src={imageUrl}
      alt={name}
      className={`${sizeClass} rounded-full object-cover ${className}`}
    />
  ) : (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-semibold ${colorFor(name)} ${className}`}
    >
      {name.charAt(0)}
    </div>
  );

  if (userId) {
    return (
      <Link to={`/athlete/${userId}`} className="flex-shrink-0">
        {inner}
      </Link>
    );
  }
  return inner;
}
