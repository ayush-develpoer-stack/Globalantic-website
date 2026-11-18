import {
  Globe,
  Code2,
  Smartphone,
  Sparkles,
  Users,
  Building2,
  ShoppingCart,
  Palette,
  Cloud,
  TrendingUp,
  Search,
  Share2,
  Target,
  Feather,
  LayoutDashboard,
  CalendarCheck,
  GraduationCap,
  Rocket,
  BarChart3,
  Wrench,
  HeartPulse,
  Building,
  ShoppingBag,
  Landmark,
  Plane,
  UtensilsCrossed,
  Factory,
  Truck,
  Car,
  Briefcase,
  Zap,
  AppWindow,
  Plug,
  MessageSquareText,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  Globe,
  Code2,
  Smartphone,
  Sparkles,
  Users,
  Building2,
  ShoppingCart,
  Palette,
  Cloud,
  TrendingUp,
  Search,
  Share2,
  Target,
  Feather,
  LayoutDashboard,
  CalendarCheck,
  GraduationCap,
  Rocket,
  BarChart3,
  Wrench,
  HeartPulse,
  Building,
  ShoppingBag,
  Landmark,
  Plane,
  UtensilsCrossed,
  Factory,
  Truck,
  Car,
  Briefcase,
  AppWindow,
  Plug,
  MessageSquareText,
};

interface IconProps {
  name?: string | null;
  size?: number;
  className?: string;
  'aria-hidden'?: boolean;
}

/** Renders a Lucide icon by its string name, falling back to a neutral icon. */
export function Icon({ name, size = 24, className, ...rest }: IconProps) {
  const Cmp = (name && iconMap[name]) || Zap;
  return <Cmp size={size} className={className} aria-hidden {...rest} />;
}
