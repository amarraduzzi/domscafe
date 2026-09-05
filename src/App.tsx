// update
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Globe, 
  ShoppingBag, 
  Plus, 
  Minus, 
  Trash2, 
  MapPin, 
  Clock, 
  ArrowRight, 
  CheckCircle, 
  TrendingUp, 
  Sparkles, 
  Phone, 
  Flame, 
  Check, 
  ChevronUp,
  ChevronDown, 
  ChevronLeft,
  ChevronRight,
  X, 
  Menu, 
  Star, 
  Instagram,
  Send, 
  Users,
  UtensilsCrossed,
  Info,
  MessageSquare,
  Lightbulb,
  Coffee,
  Fingerprint,
  Compass,
  ChefHat,
  Heart,
  Volume2,
  VolumeX
} from 'lucide-react';
import { menuItems, translations, MenuItem, philosophyValues, testimonialsData } from './data';
import { 
  createFirestoreOrder, 
  subscribeToMenuItems, 
  subscribeToCategories, 
  migrateMenuDataToFirestore, 
  initialCategories, 
  FirestoreCategory 
} from './firebase';

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

// Red Soda Can / Cola Icon component
function ColaCanIcon({ className = "w-4.5 h-4.5" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      className={className} 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Silver Top Rim */}
      <ellipse cx="12" cy="4.2" rx="5" ry="1.2" fill="#D1D5DB" stroke="#9CA3AF" strokeWidth="0.5" />
      <ellipse cx="12" cy="4" rx="3.5" ry="0.8" fill="#9CA3AF" />
      {/* Pull Tab */}
      <path d="M11 2.8 H13 V4 H11 Z" fill="#E5E7EB" stroke="#6B7280" strokeWidth="0.4" />
      {/* Red Can Body */}
      <path d="M7 4.5 C7 4.2 7.5 4 12 4 C16.5 4 17 4.2 17 4.5 V18.5 C17 19.3 15.5 20 12 20 C8.5 20 7 19.3 7 18.5 Z" fill="#DC2626" />
      {/* Silver Bottom Rim */}
      <ellipse cx="12" cy="18.8" rx="5" ry="1" fill="#9CA3AF" />
      {/* White Cola Style Wave */}
      <path d="M7.2 11.5 C9.5 9.5 13.5 13.5 16.8 11 V13.5 C13.5 15.5 9.5 11.5 7.2 13.5 Z" fill="#FFFFFF" opacity="0.95" />
      {/* Gloss Highlight */}
      <path d="M8.2 5.5 V17.5" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

// Floating particle type for "+1" animation
interface Particle {
  id: number;
  x: number;
  y: number;
}

const categories = [
  { id: 'all', icon: '🍽️', translationKey: 'menu_filter_all' },
  { id: 'boissons_chaudes', icon: '☕', translationKey: 'menu_filter_boissons_chaudes' },
  { id: 'boissons_fraiches', icon: '🥤', translationKey: 'menu_filter_boissons_fraiches' },
  { id: 'jus_cocktails', icon: '🍹', translationKey: 'menu_filter_jus_cocktails' },
  { id: 'breakfasts', icon: '🍳', translationKey: 'menu_filter_breakfasts' },
  { id: 'omelettes', icon: '🥚', translationKey: 'menu_filter_omelettes' },
  { id: 'toasts', icon: '🍞', translationKey: 'menu_filter_toasts' },
  { id: 'viennoiserie', icon: '🥐', translationKey: 'menu_filter_viennoiserie' },
  { id: 'crepes_sucrees', icon: '🥞', translationKey: 'menu_filter_crepes_sucrees' },
  { id: 'crepes_salees', icon: '🌯', translationKey: 'menu_filter_crepes_salees' },
  { id: 'pizzas', icon: '🍕', translationKey: 'menu_filter_pizzas' },
  { id: 'sandwiches', icon: '🥪', translationKey: 'menu_filter_sandwiches' },
  { id: 'tacos', icon: '🌮', translationKey: 'menu_filter_tacos' },
  { id: 'pasticcie', icon: '🍲', translationKey: 'menu_filter_pasticcie' },
  { id: 'burgers', icon: '🍔', translationKey: 'menu_filter_burgers' },
  { id: 'salades', icon: '🥗', translationKey: 'menu_filter_salades' },
  { id: 'pates', icon: '🍝', translationKey: 'menu_filter_pates' },
  { id: 'desserts', icon: '🍰', translationKey: 'menu_filter_desserts' }
] as const;

// "Why people come" highlight band, shown between the hero and the menu
// grid — client asked for a natural flow (coffee / breakfast / lunch /
// pizza) rather than just bumping pizza to the top of the existing category
// pill bar, and for pizza specifically to be highlighted. Each card jumps to
// #menu and applies a filter; 'lunch' is a synthetic id grouping several
// existing categories (see LUNCH_CATEGORIES below) purely for this band —
// the real category pills and their data are untouched.
const LUNCH_CATEGORIES = ['sandwiches', 'tacos', 'burgers', 'pasticcie', 'salades', 'pates'];
const occasions = [
  {
    id: 'boissons_chaudes',
    icon: '☕',
    title: { fr: 'Le Café', en: 'Coffee', ar: 'القهوة' },
    tag: { fr: 'Le matin commence ici', en: 'Morning starts here', ar: 'يبدأ الصباح هنا' },
  },
  {
    id: 'breakfasts',
    icon: '🍳',
    title: { fr: 'Le Petit-déjeuner', en: 'Breakfast', ar: 'الفطور' },
    tag: { fr: 'Œufs, viennoiseries, crêpes', en: 'Eggs, pastries, crêpes', ar: 'بيض ومعجنات وكريب' },
  },
  {
    id: 'lunch',
    icon: '🥪',
    title: { fr: 'Le Déjeuner', en: 'Lunch', ar: 'الغداء' },
    tag: { fr: 'Sandwichs, tacos, pâtes, salades', en: 'Sandwiches, tacos, pasta, salads', ar: 'سندويشات وتاكو ومعكرونة وسلطات' },
  },
  {
    id: 'pizzas',
    icon: '🍕',
    title: { fr: 'La Pizza', en: 'Pizza', ar: 'البيتزا' },
    tag: { fr: 'Cuite à la commande', en: 'Made fresh to order', ar: 'تُحضَّر عند الطلب' },
    featured: true,
  },
] as const;

// SafeImage component that falls back to solid brand-colored (#C9A15A) placeholder on load error
function SafeImage({ src, alt, fallbackName, className, isCart }: { src: string; alt: string; fallbackName: string; className?: string; isCart?: boolean }) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    if (isCart) {
      return (
        <div 
          className={`w-full h-full flex items-center justify-center text-center select-none text-[#F3ECDD] font-black text-[10px] ${className}`}
          style={{ backgroundColor: '#C9A15A' }}
        >
          {fallbackName.slice(0, 3)}
        </div>
      );
    }
    return (
      <div 
        className={`w-full h-full flex flex-col items-center justify-center p-4 text-center select-none ${className}`}
        style={{ backgroundColor: '#C9A15A' }}
      >
        <span className="font-display font-black text-[#F3ECDD] text-base md:text-lg tracking-wide uppercase line-clamp-2 px-2">
          {fallbackName}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-[#F3ECDD]/70 mt-1 font-sans">
          Dom's Café
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setHasError(true)}
    />
  );
}

export default function App() {
  const [lang, setLang] = useState<'en' | 'fr' | 'ar'>('fr');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [address, setAddress] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [liveMenuItems, setLiveMenuItems] = useState<MenuItem[]>(menuItems);
  const [liveCategories, setLiveCategories] = useState<FirestoreCategory[]>(initialCategories);
  const [selectedAtomic, setSelectedAtomic] = useState<Record<string, boolean>>({});
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [orderType, setOrderType] = useState<'dine_in' | 'delivery'>('dine_in');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [isOrderPlaced, setIsOrderPlaced] = useState<boolean>(false);
  const [isCheckoutConfirmOpen, setIsCheckoutConfirmOpen] = useState<boolean>(false);
  const [isClearCartConfirmOpen, setIsClearCartConfirmOpen] = useState<boolean>(false);
  const [lastAddedFoodCategory, setLastAddedFoodCategory] = useState<string | null>(null);
  const [isSuggestionDismissed, setIsSuggestionDismissed] = useState<boolean>(false);

  // Auto-migrate menu data to Firestore if empty, and subscribe to real-time updates
  useEffect(() => {
    migrateMenuDataToFirestore().then((res) => {
      if (res.itemsMigrated > 0 || res.categoriesMigrated > 0) {
        console.log(`Firestore migration complete: ${res.itemsMigrated} items, ${res.categoriesMigrated} categories created.`);
      }
    });

    const unsubItems = subscribeToMenuItems("doms-cafe", (items) => {
      if (items && items.length > 0) {
        setLiveMenuItems(items);
      }
    });

    const unsubCategories = subscribeToCategories("doms-cafe", (cats) => {
      if (cats && cats.length > 0) {
        setLiveCategories(cats);
      }
    });

    return () => {
      unsubItems();
      unsubCategories();
    };
  }, []);

  // Load language from browser or localStorage and read table query param
  useEffect(() => {
    const savedLang = localStorage.getItem('louai_lang') as 'en' | 'fr' | 'ar';
    if (savedLang && ['en', 'fr', 'ar'].includes(savedLang)) {
      setLang(savedLang);
    } else {
      setLang('fr'); // Default to French on first load
    }

    const urlParams = new URLSearchParams(window.location.search);
    const tableParam = urlParams.get('table');
    if (tableParam) {
      setTableNumber(tableParam);
    }
  }, []);

  // Synchronize document direction and language code
  useEffect(() => {
    if (lang === 'ar') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = lang;
    }
  }, [lang]);

  // Update language setting
  const handleLangChange = (selectedLang: 'en' | 'fr' | 'ar') => {
    setLang(selectedLang);
    localStorage.setItem('louai_lang', selectedLang);
    setIsLangMenuOpen(false);
  };

  // Listen to scroll to update header styling
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close language menu on scroll or click outside
  useEffect(() => {
    if (!isLangMenuOpen) return;

    const handleOutsideClickOrScroll = (event: Event) => {
      // Close on scroll
      if (event.type === 'scroll') {
        setIsLangMenuOpen(false);
        return;
      }
      
      // Close on tap/click outside
      const target = event.target as HTMLElement;
      const langSwitcher = document.querySelector('.lang-switcher-container');
      if (langSwitcher && !langSwitcher.contains(target)) {
        setIsLangMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClickOrScroll);
    document.addEventListener('touchstart', handleOutsideClickOrScroll);
    window.addEventListener('scroll', handleOutsideClickOrScroll, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleOutsideClickOrScroll);
      document.removeEventListener('touchstart', handleOutsideClickOrScroll);
      window.removeEventListener('scroll', handleOutsideClickOrScroll);
    };
  }, [isLangMenuOpen]);

  // Quick translation helper
  const t = useMemo(() => translations[lang], [lang]);

  // Is Arabic selected (RTL)
  const isRtl = lang === 'ar';

  // Live Kitchen Status (Rabat, Morocco is on GMT+1 / GMT+0 depending on DST. Rabat is typically same as West Europe or -1 hour. Let's compute based on general local hours).
  // Louai's kitchen: Mon-Fri 12h to 23h, Weekend 14h to 23h.
  const kitchenStatus = useMemo(() => {
    // Current GMT time
    const now = new Date();
    // Get Rabat time by offsetting to UTC+1 (Morocco's standard time)
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const rabatTime = new Date(utc + (3600000 * 1)); // Rabat is UTC+1
    const day = rabatTime.getDay(); // 0 is Sunday, 1 is Monday, etc.
    const hour = rabatTime.getHours();

    const isWeekend = day === 0 || day === 6;
    const openHour = isWeekend ? 14 : 12;
    const closeHour = 23;

    const isOpen = hour >= openHour && hour < closeHour;

    return {
      isOpen,
      openHour,
      closeHour,
      timeString: rabatTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dayName: rabatTime.toLocaleDateString(lang === 'ar' ? 'ar-MA' : lang === 'fr' ? 'fr-MA' : 'en-MA', { weekday: 'long' })
    };
  }, [lang]);

  // Handle adding items to order with target click location for floating particle
  const addToCart = (item: MenuItem, event?: React.MouseEvent) => {
    const isFood = !['boissons_chaudes', 'jus_cocktails', 'boissons_fraiches', 'viennoiserie', 'desserts'].includes(item.category);
    if (isFood) {
      setLastAddedFoodCategory(item.category);
      setIsSuggestionDismissed(false);
    }

    let targetItem = item;
    
    if (item.variants && item.variants.length > 0) {
      const hasVariantSuffix = item.variants.some(v => item.id.endsWith(`-${v.id}`));
      if (!hasVariantSuffix) {
        const activeVariantId = selectedVariants[item.id] || item.variants[0].id;
        const variant = item.variants.find(v => v.id === activeVariantId)!;
        targetItem = {
          ...item,
          id: `${item.id}-${variant.id}`,
          name: {
            en: `${item.name.en} (${variant.name.en})`,
            fr: `${item.name.fr} (${variant.name.fr})`,
            ar: `${item.name.ar} (${variant.name.ar})`
          },
          price: Number(variant.price) || item.price,
          image: variant.image || item.image
        };
      }
    }

    const isAtomicSelected = (item.category as string) === 'bombs' && selectedAtomic[item.id];
    if (isAtomicSelected && !targetItem.id.endsWith('-atomic')) {
      targetItem = {
        ...targetItem,
        id: `${targetItem.id}-atomic`,
        name: {
          en: `${targetItem.name.en} (Atomic)`,
          fr: `${targetItem.name.fr} (Atomic)`,
          ar: `${targetItem.name.ar} (النسخة الذرية)`
        },
        price: Number(targetItem.price) + 3
      };
    }

    setCart(prevCart => {
      const existing = prevCart.find(cartItem => cartItem.menuItem.id === targetItem.id);
      if (existing) {
        return prevCart.map(cartItem => 
          cartItem.menuItem.id === targetItem.id 
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      }
      return [...prevCart, { menuItem: targetItem, quantity: 1 }];
    });

    // Trigger "+1" floating particle animation
    if (event) {
      const rect = event.currentTarget.getBoundingClientRect();
      const newParticle: Particle = {
        id: Date.now() + Math.random(),
        x: rect.left + rect.width / 2,
        y: rect.top
      };
      setParticles(prev => [...prev, newParticle]);
      setTimeout(() => {
        setParticles(prev => prev.filter(p => p.id !== newParticle.id));
      }, 1000);
    }
  };

  const removeFromCart = (itemId: string) => {
    setCart(prevCart => {
      const existing = prevCart.find(cartItem => cartItem.menuItem.id === itemId);
      if (existing && existing.quantity > 1) {
        return prevCart.map(cartItem => 
          cartItem.menuItem.id === itemId 
            ? { ...cartItem, quantity: cartItem.quantity - 1 }
            : cartItem
        );
      }
      return prevCart.filter(cartItem => cartItem.menuItem.id !== itemId);
    });
  };

  const deleteFromCart = (itemId: string) => {
    setCart(prevCart => prevCart.filter(cartItem => cartItem.menuItem.id !== itemId));
  };

  const clearCart = () => {
    setCart([]);
    setIsCartOpen(false);
    setIsClearCartConfirmOpen(false);
  };

  // Cart math
  const subtotal = useMemo(() => {
    return cart.reduce((acc, curr) => acc + (curr.menuItem.price * curr.quantity), 0);
  }, [cart]);

  const deliveryFee = useMemo(() => {
    if (orderType === 'dine_in' || subtotal === 0) return 0;
    return subtotal >= 200 ? 0 : 15;
  }, [subtotal, orderType]);

  const total = subtotal + deliveryFee;
  const totalItemsCount = cart.reduce((acc, curr) => acc + curr.quantity, 0);

  const formatPriceDisplay = (amount: number) => {
    const currency = lang === 'ar' ? 'درهم' : 'MAD';
    return `${amount} ${currency}`;
  };

  // Generate WhatsApp compiled API string
  const getWhatsAppLink = () => {
    const waNumber = "212611053649"; // Format without plus/zeros for direct link
    
    const lines: string[] = [];
    lines.push("NOUVELLE COMMANDE");
    lines.push("----------------------------------------");
    
    cart.forEach(item => {
      const nameFr = item.menuItem.name.fr;
      const priceStr = (item.menuItem.price * item.quantity).toString();
      lines.push(`${item.quantity}x ${nameFr} : ${priceStr} MAD`);
    });
    
    lines.push("----------------------------------------");
    lines.push(`Sous-total : ${subtotal} MAD`);
    
    if (orderType === 'delivery') {
      lines.push(`Livraison : ${deliveryFee} MAD`);
    }
    
    lines.push(`TOTAL : ${total} MAD`);
    lines.push("----------------------------------------");
    
    if (orderType === 'dine_in') {
      if (tableNumber && firstName) {
        lines.push(`Sur place, Table ${tableNumber} (${firstName})`);
      } else if (tableNumber) {
        lines.push(`Sur place, Table ${tableNumber}`);
      } else if (firstName) {
        lines.push(`Sur place, ${firstName}`);
      } else {
        lines.push(`Sur place`);
      }
    } else {
      lines.push(`Livraison: ${firstName || 'Client'}, ${address || 'Non spécifiée'}`);
    }
    
    const text = lines.join("\n");
    return `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
  };

  const filteredItems = useMemo(() => {
    if (activeCategory === 'all') {
      const categoryPriority: Record<string, number> = {
        'boissons_chaudes': 1,
        'jus_cocktails': 2,
        'boissons_fraiches': 3
      };
      return [...liveMenuItems].sort((a, b) => {
        const pA = categoryPriority[a.category] || 99;
        const pB = categoryPriority[b.category] || 99;
        return pA - pB;
      });
    }
    if (activeCategory === 'lunch') {
      return liveMenuItems.filter(item => LUNCH_CATEGORIES.includes(item.category));
    }
    return liveMenuItems.filter(item => item.category === activeCategory);
  }, [activeCategory, liveMenuItems]);

  return (
    <div 
      id="app-root"
      dir={isRtl ? 'rtl' : 'ltr'} 
      className={`min-h-screen bg-brand-dark text-[#F3ECDD] font-sans ${isRtl ? 'font-arabic' : ''} bg-grid-pattern selection:bg-brand-orange selection:text-[#1A1208] overflow-x-hidden overflow-y-auto`}
    >
      {/* Top Announcement Bar */}
      <div className="bg-brand-orange text-[#1A1208] py-2 px-4 text-center font-display font-black text-xs md:text-sm tracking-widest flex items-center justify-center gap-2 z-50 relative shadow-lg shadow-brand-orange/10">
        <span>
          {lang === 'ar' ? 'المكان الذي تصبح فيه كل استراحة لحظة مميزة.' : lang === 'fr' ? "L'endroit où chaque pause devient un moment." : 'The place where every break becomes a moment.'}
        </span>
        <div className="flex items-center space-x-0.5 rtl:space-x-reverse shrink-0">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-3.5 h-3.5 fill-black text-[#1A1208]" />
          ))}
        </div>
      </div>

      {/* Floating "+1" particles */}
      <AnimatePresence>
        {particles.map(p => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, y: p.y, x: p.x, scale: 1 }}
            animate={{ opacity: 0, y: p.y - 120, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="fixed pointer-events-none z-[9999] font-display font-black text-2xl text-brand-orange drop-shadow-[0_4px_12px_rgba(255,107,0,0.6)]"
          >
            +1
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Sticky Top Navigation Header */}
      <header 
        id="navbar"
        className={`fixed left-0 right-0 z-40 transition-all duration-300 ${
          scrolled 
            ? 'top-0 bg-brand-dark/95 backdrop-blur-md border-b border-brand-orange/20 py-3 shadow-lg shadow-black/80' 
            : 'top-10 sm:top-10 bg-gradient-to-b from-black/80 to-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between">
          {/* Logo & Brand Identity — real logo artwork (same file as the main
              domscafeagdal site's header), replacing the old styled-text
              "Dom's" wordmark so both properties show the same mark instead
              of two different approximations of it. */}
          <a href="#app-root" className="flex items-center select-none group">
            <img src="/logo.webp" alt="Dom's Café & Restaurant" className="h-11 md:h-14 w-auto object-contain" />
          </a>

          {/* Right Header Actions */}
          <div className="flex items-center space-x-3 md:space-x-4 rtl:space-x-reverse">
            {/* Language Switcher Dropdown */}
            <div className="relative lang-switcher-container">
              <button 
                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                className="bg-brand-dark-card border border-[#F3ECDD]/10 hover:border-brand-orange/40 text-[#E3DCCB] px-3 py-1.5 rounded-md text-xs font-bold flex items-center space-x-1.5 rtl:space-x-reverse transition-all active:scale-95"
              >
                <Globe className="w-3.5 h-3.5 text-brand-orange" />
                <span className="uppercase">{lang}</span>
                <ChevronDown className={`w-3 h-3 text-[#9A9490] transition-transform duration-200 ${isLangMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isLangMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 rtl:left-0 mt-2 w-32 bg-brand-dark-card border border-[#F3ECDD]/15 rounded-lg shadow-2xl py-1 overflow-hidden z-50 text-xs"
                  >
                    <button 
                      onClick={() => handleLangChange('en')}
                      className={`w-full text-start px-4 py-2 hover:bg-[#F3ECDD]/5 transition-colors flex items-center justify-between ${lang === 'en' ? 'text-brand-orange font-bold' : 'text-[#C7BFB0]'}`}
                    >
                      <span>English</span>
                      {lang === 'en' && <Check className="w-3 h-3" />}
                    </button>
                    <button 
                      onClick={() => handleLangChange('fr')}
                      className={`w-full text-start px-4 py-2 hover:bg-[#F3ECDD]/5 transition-colors flex items-center justify-between ${lang === 'fr' ? 'text-brand-orange font-bold' : 'text-[#C7BFB0]'}`}
                    >
                      <span>Français</span>
                      {lang === 'fr' && <Check className="w-3 h-3" />}
                    </button>
                    <button 
                      onClick={() => handleLangChange('ar')}
                      className={`w-full text-start px-4 py-2 hover:bg-[#F3ECDD]/5 transition-colors flex items-center justify-between ${lang === 'ar' ? 'text-brand-orange font-bold' : 'text-[#C7BFB0]'}`}
                    >
                      <span>العربية</span>
                      {lang === 'ar' && <Check className="w-3 h-3" />}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Shopping Cart Trigger */}
            <button 
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 rounded-full bg-brand-orange text-[#1A1208] font-bold hover:bg-brand-orange-hover hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-brand-orange/25"
            >
              <ShoppingBag className="w-4 h-4 md:w-5 h-5" />
              {totalItemsCount > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-white text-[#1A1208] font-sans font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-brand-dark animate-pulse">
                  {totalItemsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section — the background photo here used to be
          "louais_storefront_queue...jpg", a leftover asset from whatever
          other business (unrelated "Louai" branding, see the localStorage
          key below too) this template was originally built for, not an
          actual photo of Dom's. Rather than show a wrong storefront (or
          fabricate an AI "interior" photo, which the client has separately
          said not to do), this is now the same plain warm gradient look the
          main marketing site uses for sections without a real photo, until
          a real Dom's photo is supplied. */}
      <section
        id="hero"
        className="relative min-h-[30vh] md:min-h-[35vh] flex flex-col items-center justify-center pt-28 pb-8 overflow-hidden bg-cover bg-center bg-brand-dark"
      >
        {/* Ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-brand-orange/10 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="max-w-4xl mx-auto px-4 w-full relative z-10 flex flex-col items-center justify-center text-center">
          <h1 className="text-4xl md:text-6xl font-display font-black tracking-tight text-[#F3ECDD] mb-4 uppercase leading-tight">
            {t.hero_headline_1} <span className="text-brand-orange">{t.hero_headline_highlight}</span>
          </h1>
          <p className="text-[#C7BFB0] text-sm md:text-base tracking-wide max-w-xl mb-8 font-medium">
            {t.hero_tagline}
          </p>

          {/* Tab Categories Switcher inside Hero directly below — restyled to
              match the main site's slim MenuContent.astro filter pills
              (.menu-filter-btn): individually thin-bordered pills directly on
              the section background, no grouping card/blur/shadow, and the
              category emoji sized to match the label text (em-relative)
              rather than a fixed larger icon size, so it reads as a subtle
              inline glyph instead of a small colorful image next to the
              text. */}
          <div className="flex justify-center w-full max-w-full px-2">
            <div className="flex flex-nowrap overflow-x-auto justify-start gap-2 text-xs md:text-sm font-bold max-w-full no-scrollbar snap-x scroll-smooth">
              {liveCategories.map((cat) => {
                const catLabel = cat.name?.[lang] || cat.name?.fr || (t as any)[`menu_filter_${cat.id}`] || cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className={`px-4 py-2 rounded-full border transition-all flex items-center space-x-1.5 rtl:space-x-reverse cursor-pointer shrink-0 snap-start ${
                      activeCategory === cat.id
                        ? 'bg-brand-orange text-[#1A1208] border-brand-orange font-extrabold'
                        : 'bg-transparent border-[#F3ECDD]/15 text-[#9A9490] hover:text-brand-orange hover:border-brand-orange/40'
                    }`}
                  >
                    <span className="text-[0.95em] leading-none flex items-center justify-center">
                      {cat.id === 'boissons_fraiches' ? (
                        <ColaCanIcon className="w-3.5 h-3.5 inline-block shrink-0" />
                      ) : (
                        cat.emoji
                      )}
                    </span>
                    <span>{catLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* "Why people come" highlight band — see the `occasions` const above
          for the reasoning. Pizza gets a visually bigger, accent-bordered
          card (its own reason to visit, same weight as coffee/breakfast/
          lunch) instead of just being one pill among many further down. */}
      <section className="py-10 md:py-14 relative bg-brand-dark border-t border-b border-[#F3ECDD]/5">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {occasions.map((occ) => (
              <button
                key={occ.id}
                onClick={() => {
                  setActiveCategory(occ.id);
                  document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`group flex flex-col items-center text-center rounded-2xl px-3 py-5 md:py-6 transition-all duration-300 hover:-translate-y-1 active:scale-95 ${
                  occ.featured
                    ? 'bg-gradient-to-b from-brand-orange/15 to-brand-dark-card border-2 border-brand-orange/50 hover:border-brand-orange'
                    : 'bg-brand-dark-card border border-[#F3ECDD]/10 hover:border-brand-orange/40'
                }`}
              >
                <span className={`text-3xl md:text-4xl mb-2 transition-transform duration-300 group-hover:scale-110 ${occ.featured ? 'drop-shadow-[0_0_14px_rgba(201,161,90,0.5)]' : ''}`}>
                  {occ.icon}
                </span>
                <span className="font-display font-bold text-sm md:text-lg text-[#F3ECDD]">
                  {occ.title[lang]}
                </span>
                <span className="text-[10px] md:text-xs text-[#9A9490] mt-1 leading-snug">
                  {occ.tag[lang]}
                </span>
                {occ.featured && (
                  <span className="mt-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-brand-orange">
                    {lang === 'ar' ? 'الأكثر طلبًا ↗' : lang === 'en' ? 'Most popular ↗' : 'Le plus demandé ↗'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Menu & WhatsApp Cart */}
      <section id="menu" className="pt-8 pb-12 relative">
        <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
          
          {/* Section Header */}
          <div className="text-center max-w-3xl mx-auto mb-8">
            <span className="text-brand-orange font-sans font-black text-xs tracking-widest mb-3 uppercase inline-block">
              {t.menu_tag}
            </span>
            <h2 className="text-3xl md:text-5xl font-display font-black tracking-tight mb-2">
              {activeCategory === 'all'
                ? t.menu_title
                : activeCategory === 'lunch'
                ? occasions.find(o => o.id === 'lunch')!.title[lang]
                : (liveCategories.find(c => c.id === activeCategory)?.name?.[lang] || (t as any)[`menu_filter_${activeCategory}`] || activeCategory)}
            </h2>
            <p className="text-[#9A9490] text-sm md:text-base">
              {t.menu_subtitle}
            </p>
          </div>

          {/* Interactive Menu Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
                {filteredItems.map(item => {
                  const isAtomicSelected = (item.category as string) === 'bombs' && selectedAtomic[item.id];
                  const activeVariantId = item.variants && item.variants.length > 0 
                    ? (selectedVariants[item.id] || item.variants[0].id) 
                    : null;
                  const resolvedId = activeVariantId 
                    ? `${item.id}-${activeVariantId}` 
                    : (isAtomicSelected 
                        ? `${item.id}-atomic` 
                        : item.id);
                  const cartItem = cart.find(ci => ci.menuItem.id === resolvedId);
                  const isItemAdded = (cartItem?.quantity || 0) > 0;
                  const activeVariant = item.variants?.find(v => v.id === activeVariantId);
                  const displayPrice = activeVariant 
                    ? activeVariant.price 
                    : (isAtomicSelected ? item.price + 3 : item.price);

                  return (
                    <motion.div 
                      key={item.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.3 }}
                      className="bg-brand-dark-card border border-[#F3ECDD]/10 rounded-xl overflow-hidden group hover:border-brand-orange/40 transition-all duration-300 shadow-xl shadow-black/80 flex flex-col justify-between"
                    >
                      <div className="relative h-48 overflow-hidden bg-brand-dark flex items-center justify-center">
                        <SafeImage 
                          src={activeVariant?.image || item.image} 
                          alt={item.name[lang]} 
                          fallbackName={item.name[lang]}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark-card/40 to-transparent"></div>
                        
                        {/* Badges */}
                        <div className="absolute top-3 left-3 rtl:left-auto rtl:right-3 flex flex-col space-y-1.5 items-start">
                          {item.popular && (
                            <span className="bg-brand-orange text-[#1A1208] font-sans font-black text-[9px] tracking-widest px-2 py-0.5 rounded shadow flex items-center space-x-1 uppercase">
                              <Sparkles className="w-3 h-3 fill-black shrink-0" />
                              <span>{t.menu_popular}</span>
                            </span>
                          )}
                          {item.spicy && (
                            <span className="bg-red-600 text-[#F3ECDD] font-sans font-black text-[9px] tracking-widest px-2 py-0.5 rounded shadow flex items-center space-x-1 uppercase">
                              <Flame className="w-3 h-3 fill-white shrink-0" />
                              <span>{t.menu_spicy}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-5 flex flex-col justify-between grow text-start">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-display font-bold text-lg text-[#F3ECDD] group-hover:text-brand-orange transition-colors">
                              {item.name[lang]}
                            </h3>
                            <span className="font-display font-black text-brand-orange whitespace-nowrap ps-2">
                              {displayPrice} {lang === 'ar' ? 'درهم' : 'MAD'}
                            </span>
                          </div>
                          <p className="text-[#9A9490] text-xs md:text-sm font-light leading-relaxed mb-4">
                            {activeVariant?.description?.[lang] || item.description[lang]}
                          </p>

                          {/* Variations selector if available */}
                          {item.variants && item.variants.length > 0 && (
                            <div className="mb-4">
                              <span className="text-[#7A736C] font-sans text-[9px] uppercase tracking-wider block mb-1.5">
                                {lang === 'ar' ? 'اختر النوع:' : lang === 'fr' ? 'Sélectionner l\'option :' : 'Select Option:'}
                              </span>
                              <div className="flex bg-[#F3ECDD]/5 border border-[#F3ECDD]/10 p-1 rounded-lg gap-1">
                                {item.variants.map(v => (
                                  <button
                                    key={v.id}
                                    onClick={() => setSelectedVariants(prev => ({ ...prev, [item.id]: v.id }))}
                                    className={`flex-1 text-center py-1.5 rounded-md text-[11px] font-bold transition-all ${
                                      activeVariantId === v.id
                                        ? 'bg-brand-orange text-[#1A1208] font-black'
                                        : 'text-[#9A9490] hover:text-[#F3ECDD] hover:bg-[#F3ECDD]/5'
                                    }`}
                                  >
                                    {v.name[lang] || v.name.en} ({v.price} {lang === 'ar' ? 'درهم' : 'MAD'})
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Version Atomic selector if bomb */}
                          {item.category === 'bombs' && (
                            <div className="mb-4">
                              <span className="text-[#7A736C] font-sans text-[9px] uppercase tracking-wider block mb-1.5">
                                {lang === 'ar' ? 'إضافة ترقية:' : lang === 'fr' ? 'Option supplémentaire :' : 'Add upgrade:'}
                              </span>
                              <label className="flex items-center space-x-3 rtl:space-x-reverse cursor-pointer bg-[#F3ECDD]/5 border border-[#F3ECDD]/10 p-2.5 rounded-lg hover:bg-[#F3ECDD]/10 transition-all select-none">
                                <input
                                  type="checkbox"
                                  checked={!!selectedAtomic[item.id]}
                                  onChange={(e) => setSelectedAtomic(prev => ({ ...prev, [item.id]: e.target.checked }))}
                                  className="w-4 h-4 rounded border-[#6B6259] text-brand-orange focus:ring-brand-orange focus:ring-offset-black bg-black/40 cursor-pointer"
                                />
                                <div className="flex-1 flex justify-between items-center text-xs font-bold text-[#F3ECDD]">
                                  <span>{lang === 'ar' ? 'النسخة الذرية (حار جداً)' : lang === 'fr' ? 'Version Atomic' : 'Atomic Version'}</span>
                                  <span className="text-brand-orange">+3 {lang === 'ar' ? 'درهم' : 'MAD'}</span>
                                </div>
                              </label>
                            </div>
                          )}

                          {/* Atomic Version Checkbox for Tacos */}
                        </div>

                        <div className="flex items-center justify-between">
                          {/* Cart Quantities control */}
                          {isItemAdded ? (
                            <div className="flex items-center space-x-1.5 rtl:space-x-reverse bg-[#F3ECDD]/5 border border-[#F3ECDD]/10 rounded-lg p-1 text-sm font-sans">
                              <button 
                                onClick={() => removeFromCart(resolvedId)}
                                className="w-8 h-8 rounded-md hover:bg-[#F3ECDD]/10 text-[#C7BFB0] active:scale-90 transition-transform flex items-center justify-center"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-6 text-center font-bold text-brand-orange">
                                {cartItem?.quantity}
                              </span>
                              <button 
                                onClick={(e) => addToCart(item, e)}
                                className="w-8 h-8 rounded-md hover:bg-[#F3ECDD]/10 text-[#C7BFB0] active:scale-90 transition-transform flex items-center justify-center"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={(e) => addToCart(item, e)}
                              className="w-full border px-4 py-2.5 rounded-lg font-display font-black text-xs transition-all flex items-center justify-center space-x-2 rtl:space-x-reverse bg-[#F3ECDD]/5 hover:bg-brand-orange hover:text-[#1A1208] border-[#F3ECDD]/10 hover:border-transparent active:scale-95 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{t.menu_add_to_cart}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
            </AnimatePresence>
          </div>

          {/* Back to Top Menu Button */}
          <div className="mt-10 flex justify-center">
            <button
              onClick={() => {
                const element = document.getElementById('hero') || document.getElementById('menu');
                element?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-6 py-3.5 bg-brand-dark-card border border-brand-orange/40 hover:border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-[#1A1208] font-display font-extrabold text-xs md:text-sm tracking-wide rounded-xl transition-all duration-300 shadow-xl shadow-black/80 hover:shadow-brand-orange/20 flex items-center space-x-2.5 rtl:space-x-reverse cursor-pointer active:scale-95 group"
            >
              <ChevronUp className="w-4 h-4 group-hover:-translate-y-1 transition-transform duration-200" />
              <span>{t.back_to_top_menu}</span>
            </button>
          </div>

        </div>
      </section>

      {/* Compact Brand Section */}
      <section id="brand-info-strip" className="py-5 bg-[#150F09] border-t border-b border-[#F3ECDD]/5 relative z-10 flex flex-col items-center justify-center text-center">
        <div className="max-w-xl mx-auto px-4 flex flex-col gap-2">
          {/* Brand Text Stack */}
          <div className="flex flex-col gap-0.5 text-[#F3ECDD]/90 text-xs sm:text-sm md:text-base font-medium">
            <p>{t.brand_line1}</p>
            <p>{t.brand_line2}</p>
            <p>{t.brand_line3}</p>
          </div>

          {/* Trust Line */}
          <div className="flex items-center justify-center">
            <a 
              href="#" 
              id="brand_google_link"
              className="inline-flex items-center gap-1 text-xs sm:text-sm text-[#9A9490] hover:text-brand-orange transition-colors font-medium"
            >
              <Star className="w-3.5 h-3.5 fill-brand-orange text-brand-orange shrink-0" />
              <span>{t.brand_trust}</span>
            </a>
          </div>

          {/* Social Line */}
          <div className="flex items-center justify-center">
            <a 
              href="https://instagram.com/domscafe_official" 
              target="_blank" 
              rel="noopener noreferrer"
              id="brand_instagram_link"
              className="inline-flex items-center gap-1 text-xs sm:text-sm text-[#9A9490] hover:text-brand-orange transition-colors font-medium"
            >
              <Instagram className="w-3.5 h-3.5 text-brand-orange shrink-0" />
              <span>@domscafe_official</span>
            </a>
          </div>

          {/* Delivery Promise Line */}
          <p className="text-brand-orange font-semibold text-xs sm:text-sm tracking-wide">
            {t.brand_promise}
          </p>
        </div>
      </section>

      {/* Compact Hours and Location Card (Moved to bottom above footer) */}
      <section id="location" className="py-12 relative bg-brand-dark overflow-hidden border-t border-[#F3ECDD]/5">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-brand-orange/5 rounded-full blur-[80px] pointer-events-none"></div>

        <div className="max-w-2xl mx-auto px-4 relative z-10">
          <div className="bg-brand-dark-card border border-[#F3ECDD]/10 rounded-2xl p-6 md:p-8 shadow-2xl shadow-black relative overflow-hidden group hover:border-brand-orange/20 transition-colors duration-300">
            {/* Ambient subtle spark glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-orange/10 rounded-full blur-2xl group-hover:bg-brand-orange/20 transition-all duration-500"></div>

            <div className="text-center mb-6">
              <span className="text-brand-orange font-sans font-black text-xs tracking-widest mb-2 uppercase inline-block">
                {t.location_tag}
              </span>
              <h2 className="text-2xl md:text-3xl font-display font-black tracking-tight uppercase text-[#F3ECDD] mb-1">
                {t.location_title}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-center md:text-start border-t border-[#F3ECDD]/5 pt-6">
              {/* Hours Details */}
              <div className="space-y-2">
                <h3 className="text-sm font-sans font-bold uppercase tracking-wider text-brand-orange flex items-center justify-center md:justify-start gap-1.5">
                  <Clock className="w-4 h-4" />
                  {t.location_hours_title}
                </h3>
                <div className="text-[#C7BFB0] space-y-1 text-sm font-light">
                  <p>{t.location_hours_weekdays}</p>
                  <p>{t.location_hours_weekends}</p>
                </div>
              </div>

              {/* Address Details */}
              <div className="space-y-2">
                <h3 className="text-sm font-sans font-bold uppercase tracking-wider text-brand-orange flex items-center justify-center md:justify-start gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {lang === 'ar' ? 'العنوان' : 'Adresse'}
                </h3>
                
                {/* Custom premium dark-styled map illustration */}
                <a 
                  href="https://www.google.com/maps/search/?api=1&query=Dom's+Café+%26+Restaurant,+26+rue+Jabal+Alayachi,+Agdal,+Rabat"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full aspect-[16/8] rounded-xl overflow-hidden border border-[#F3ECDD]/10 hover:border-brand-orange/40 transition-all duration-300 relative group/map cursor-pointer shadow-lg bg-[#130D07] my-3"
                  title="Dom's Café & Restaurant @ Agdal, Rabat"
                >
                  <svg viewBox="0 0 400 200" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="oceanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#120C06" />
                        <stop offset="100%" stopColor="#2A2013" />
                      </linearGradient>
                      <linearGradient id="landGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#130D07" />
                        <stop offset="100%" stopColor="#17110A" />
                      </linearGradient>
                      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#C9A15A" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#C9A15A" stopOpacity={0} />
                      </radialGradient>
                    </defs>

                    {/* Land Background */}
                    <rect width="400" height="200" fill="url(#landGrad)" />

                    {/* Coastline/Water (Top-Left area representing Rabat coast) */}
                    <path d="M 0,130 Q 110,105 230,0 L 0,0 Z" fill="url(#oceanGrad)" opacity={0.9} />
                    <path d="M 0,130 Q 110,105 230,0" fill="none" stroke="#8A6423" strokeWidth={2} opacity={0.5} />
                    <path d="M 0,132 Q 110,107 232,0" fill="none" stroke="#C9A15A" strokeWidth={1} opacity={0.15} />

                    {/* Grid Pattern for tech/modern touch */}
                    <g opacity={0.06}>
                      <line x1="40" y1="0" x2="40" y2="200" stroke="#F3ECDD" strokeWidth={1} />
                      <line x1="80" y1="0" x2="80" y2="200" stroke="#F3ECDD" strokeWidth={1} />
                      <line x1="120" y1="0" x2="120" y2="200" stroke="#F3ECDD" strokeWidth={1} />
                      <line x1="160" y1="0" x2="160" y2="200" stroke="#F3ECDD" strokeWidth={1} />
                      <line x1="200" y1="0" x2="200" y2="200" stroke="#F3ECDD" strokeWidth={1} />
                      <line x1="240" y1="0" x2="240" y2="200" stroke="#F3ECDD" strokeWidth={1} />
                      <line x1="280" y1="0" x2="280" y2="200" stroke="#F3ECDD" strokeWidth={1} />
                      <line x1="320" y1="0" x2="320" y2="200" stroke="#F3ECDD" strokeWidth={1} />
                      <line x1="360" y1="0" x2="360" y2="200" stroke="#F3ECDD" strokeWidth={1} />

                      <line x1="0" y1="40" x2="400" y2="40" stroke="#F3ECDD" strokeWidth={1} />
                      <line x1="0" y1="80" x2="400" y2="80" stroke="#F3ECDD" strokeWidth={1} />
                      <line x1="0" y1="120" x2="400" y2="120" stroke="#F3ECDD" strokeWidth={1} />
                      <line x1="0" y1="160" x2="400" y2="160" stroke="#F3ECDD" strokeWidth={1} />
                    </g>

                    {/* Route Côtière (Coastal Road) */}
                    <path d="M 0,165 Q 130,130 270,0" fill="none" stroke="#241C13" strokeWidth={14} strokeLinecap="round" />
                    <path d="M 0,165 Q 130,130 270,0" fill="none" stroke="#1D160D" strokeWidth={10} strokeLinecap="round" />
                    <path d="M 0,165 Q 130,130 270,0" fill="none" stroke="#C9A15A" strokeWidth={1} strokeDasharray="4,6" opacity={0.5} />

                    {/* Secondary roads */}
                    <path d="M 150,138 L 240,195" fill="none" stroke="#201810" strokeWidth={8} strokeLinecap="round" />
                    <path d="M 230,118 L 320,175" fill="none" stroke="#201810" strokeWidth={8} strokeLinecap="round" />
                    <path d="M 100,195 L 260,95" fill="none" stroke="#17110A" strokeWidth={6} />

                    {/* Mall du Carrousel building footprint */}
                    <g transform="translate(155, 120) rotate(-15)">
                      <rect x="0" y="0" width="70" height="32" rx="4" fill="#1B140C" stroke="#2A2118" strokeWidth={1.5} />
                      <rect x="4" y="4" width="62" height="24" rx="2" fill="#241C13" stroke="#362C1F" strokeWidth={1} />
                      <line x1="15" y1="4" x2="15" y2="28" stroke="#2A2118" strokeWidth={1} />
                      <line x1="35" y1="4" x2="35" y2="28" stroke="#2A2118" strokeWidth={1} />
                      <line x1="55" y1="4" x2="55" y2="28" stroke="#2A2118" strokeWidth={1} />
                    </g>

                    {/* Ocean text */}
                    <text x="35" y="45" fill="#6B6259" fontFamily="monospace" fontSize="8" letterSpacing="1" fontWeight="bold" opacity={0.7} transform="rotate(-15, 35, 45)">
                      {lang === 'ar' ? 'المحيط الأطلسي' : lang === 'fr' ? 'OCÉAN ATLANTIQUE' : 'ATLANTIC OCEAN'}
                    </text>
                    
                    {/* Road text */}
                    <text x="75" y="142" fill="#7A736C" fontFamily="sans-serif" fontSize="7" fontWeight="bold" letterSpacing="0.5" transform="rotate(-14, 75, 142)">
                      {lang === 'ar' ? 'الطريق الساحلي' : 'ROUTE CÔTIÈRE'}
                    </text>

                    {/* Mall label */}
                    <text x="160" y="108" fill="#9A9490" fontFamily="sans-serif" fontSize="7" fontWeight="bold" letterSpacing="0.5">
                      RUE JABAL ALAYACHI, AGDAL
                    </text>

                    {/* Subtle orange glow and radar circle */}
                    <circle cx="210" cy="135" r="18" fill="url(#glow)" />
                    <circle cx="210" cy="135" r="8" fill="none" stroke="#C9A15A" strokeWidth={1} opacity={0.6} />

                    {/* Pin Marker */}
                    <g transform="translate(210, 135)">
                      <ellipse cx="0" cy="0" rx="3" ry="1.5" fill="#000000" opacity={0.6} />
                      <path d="M 0,0 C -5,-5 -8,-12 -8,-18 A 8,8 0 1 1 8,-18 C 8,-12 5,-5 0,0 Z" fill="#C9A15A" stroke="#F3ECDD" strokeWidth={1} />
                      <circle cx="0" cy="-18" r="3" fill="#F3ECDD" />
                    </g>

                    {/* Dom's Café Premium Label Bubble */}
                    <g transform="translate(210, 110)">
                      <rect x="-75" y="-32" width="150" height="18" rx="4" fill="#150F09" stroke="#C9A15A" strokeWidth={1} opacity={0.95} />
                      <text x="0" y="-20" fill="#F3ECDD" fontFamily="sans-serif" fontSize="7" fontWeight="900" textAnchor="middle" letterSpacing="0.2">
                        DOM'S CAFÉ & RESTAURANT ☕
                      </text>
                      <polygon points="0,-14 -4,-9 4,-9" fill="#150F09" stroke="#C9A15A" strokeWidth={1} transform="translate(0, -5)" />
                      <line x1="-3" y1="-14" x2="3" y2="-14" stroke="#150F09" strokeWidth={1.5} />
                    </g>
                  </svg>
                  
                  {/* Subtle map overlay interaction cues */}
                  <div className="absolute inset-0 bg-brand-orange/0 group-hover/map:bg-brand-orange/[0.03] transition-colors duration-300 flex items-center justify-center">
                    <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-[9px] font-sans font-medium text-brand-orange tracking-wider opacity-60 group-hover/map:opacity-100 transition-opacity">
                      {lang === 'ar' ? 'عرض الخريطة ↗' : lang === 'fr' ? 'VOIR LA CARTE ↗' : 'VIEW MAP ↗'}
                    </div>
                  </div>
                </a>

                <p className="text-[#C7BFB0] text-sm font-light">
                  {t.location_address}
                </p>
              </div>
            </div>

            {/* Action button */}
            <div className="mt-8 flex justify-center">
              <a 
                href="https://www.google.com/maps/search/?api=1&query=Dom's+Café+%26+Restaurant,+26+rue+Jabal+Alayachi,+Agdal,+Rabat" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 rtl:space-x-reverse bg-[#F3ECDD]/5 hover:bg-[#F3ECDD]/10 border border-[#F3ECDD]/15 hover:border-brand-orange/40 text-[#F3ECDD] font-bold py-3 px-6 rounded-lg text-xs md:text-sm transition-all duration-300 w-full sm:w-auto justify-center cursor-pointer shadow-lg active:scale-95"
              >
                <MapPin className="w-3.5 h-3.5 text-brand-orange animate-bounce" />
                <span>{t.location_maps_btn}</span>
              </a>
            </div>
          </div>
        </div>
      </section>



      {/* Main Footer */}
      <footer className="border-t border-[#F3ECDD]/10 bg-black py-12 text-center text-xs text-[#7A736C] font-medium">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          
          {/* Footer brand identification — same real logo as the header. */}
          <div className="flex flex-col items-center md:items-start select-none">
            <img src="/logo.webp" alt="Dom's Café & Restaurant" className="h-10 md:h-12 w-auto object-contain" />
          </div>

          <p className="max-w-md">
            {t.footer_text}
          </p>

          <div className="flex items-center space-x-2 rtl:space-x-reverse font-display font-black text-sm text-brand-orange italic">
            <span>{t.footer_tagline}</span>
          </div>

        </div>
      </footer>

      {/* Sticky Cart Bar (Global) */}
      <AnimatePresence>
        {totalItemsCount > 0 && !isCartOpen && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-black/95 border-t border-[#F3ECDD]/10 backdrop-blur-md px-4 py-3.5 shadow-2xl"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              {/* Items count & Total price */}
              <div 
                onClick={() => setIsCartOpen(true)}
                className="flex items-center space-x-3.5 rtl:space-x-reverse cursor-pointer group shrink-0"
              >
                <div className="bg-brand-orange text-[#1A1208] w-7 h-7 rounded-full font-sans text-sm flex items-center justify-center font-black group-hover:scale-105 transition-transform">
                  {totalItemsCount}
                </div>
                <div className="flex flex-col text-start">
                  <span className="text-[10px] text-[#7A736C] font-sans uppercase tracking-wider">
                    {lang === 'ar' ? 'المجموع' : 'TOTAL'}
                  </span>
                  <span className="font-display font-black text-sm md:text-base text-brand-orange">
                    {formatPriceDisplay(total)}
                  </span>
                </div>
              </div>

              {/* Subtle clear cart trash icon */}
              <button
                disabled={isClearCartConfirmOpen}
                onClick={() => {
                  if (!isClearCartConfirmOpen) {
                    setIsClearCartConfirmOpen(true);
                  }
                }}
                className="p-2 text-[#7A736C] hover:text-red-500 transition-colors cursor-pointer rounded-full hover:bg-[#F3ECDD]/5 disabled:opacity-50 mx-2 focus:outline-none"
                title={t.cart_clear_confirm}
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* View Order button */}
              <button 
                onClick={() => setIsCartOpen(true)}
                className="bg-brand-orange hover:bg-brand-orange-hover text-[#1A1208] px-5 py-2.5 rounded-lg font-display font-black text-xs md:text-sm transition-all flex items-center space-x-1.5 rtl:space-x-reverse cursor-pointer shadow-lg shadow-brand-orange/20 active:scale-95 shrink-0"
              >
                <span>{t.cart_view_order}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-up Bottom Sheet Cart Panel (Universal) */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.75 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 pointer-events-auto"
            />
            
            {/* Bottom Sheet Drawer */}
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 w-full lg:max-w-xl max-h-[88vh] bg-brand-dark-card border-t border-x border-[#F3ECDD]/10 rounded-t-[2.5rem] p-5 md:p-6 z-50 overflow-hidden shadow-2xl shadow-black flex flex-col justify-between"
            >
              <div className="w-12 h-1 bg-[#F3ECDD]/20 rounded-full mx-auto mb-4 shrink-0" />

              <div className="flex items-center justify-between border-b border-[#F3ECDD]/10 pb-4 mb-5 shrink-0 text-start">
                <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                  <ShoppingBag className="w-5 h-5 text-brand-orange" />
                  <h3 className="font-display font-black text-lg">
                    {t.cart_title}
                  </h3>
                  {totalItemsCount > 0 && (
                    <span className="bg-brand-orange/20 text-brand-orange font-sans font-bold text-xs px-2 py-0.5 rounded-md">
                      {totalItemsCount}
                    </span>
                  )}
                  {totalItemsCount > 0 && (
                    <button
                      disabled={isClearCartConfirmOpen}
                      onClick={() => {
                        if (!isClearCartConfirmOpen) {
                          setIsClearCartConfirmOpen(true);
                        }
                      }}
                      className="p-1 text-[#7A736C] hover:text-red-500 transition-colors cursor-pointer disabled:opacity-50 focus:outline-none"
                      title={t.cart_clear_confirm}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button 
                  onClick={() => setIsCartOpen(false)}
                  className="p-1 text-[#9A9490] hover:text-[#F3ECDD] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {isOrderPlaced ? (
                <div className="py-12 text-center grow flex flex-col justify-center items-center px-4 animate-fadeIn">
                  <div className="w-16 h-16 rounded-full bg-brand-orange/10 flex items-center justify-center mb-6 border-2 border-brand-orange text-brand-orange">
                    <Check className="w-8 h-8 stroke-[3]" />
                  </div>
                  <h4 className="font-display font-black text-xl text-[#F3ECDD] mb-3">
                    {lang === 'ar' ? 'تم إرسال الطلب بنجاح!' : lang === 'fr' ? 'Commande envoyée !' : 'Order Sent Successfully!'}
                  </h4>
                  <p className="text-sm text-[#C7BFB0] leading-relaxed max-w-sm mb-8">
                    {orderType === 'dine_in' 
                      ? t.cart_confirm_dine_in 
                      : t.cart_confirm_delivery}
                  </p>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setCart([]);
                      setIsOrderPlaced(false);
                      setIsCartOpen(false);
                    }}
                    className="w-full bg-brand-orange hover:bg-brand-orange-hover text-[#1A1208] py-3.5 rounded-lg font-display font-black text-sm text-center shadow-lg shadow-brand-orange/20 cursor-pointer"
                  >
                    {t.cart_btn_new_order}
                  </motion.button>
                </div>
              ) : cart.length === 0 ? (
                <div className="py-16 text-center text-[#7A736C] grow flex flex-col justify-center">
                  <div className="w-16 h-16 rounded-full bg-[#F3ECDD]/5 flex items-center justify-center mx-auto mb-4 border border-[#F3ECDD]/10">
                    <ShoppingBag className="w-6 h-6 text-[#9A9490]" />
                  </div>
                  <p className="text-sm px-4">
                    {t.cart_empty}
                  </p>
                </div>
              ) : (
                <div className="grow overflow-y-auto pr-1 rtl:pl-1 flex flex-col justify-between">
                  <div>
                    {/* Order Type Toggle Selector */}
                    <div className="mb-6">
                      <div className="grid grid-cols-2 gap-3">
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          type="button"
                          onClick={() => setOrderType('dine_in')}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-300 relative overflow-hidden ${
                            orderType === 'dine_in'
                              ? 'bg-brand-orange text-[#1A1208] border-transparent font-black shadow-lg shadow-brand-orange/20'
                              : 'bg-[#F3ECDD]/5 border-[#F3ECDD]/10 text-[#C7BFB0] hover:text-[#F3ECDD] hover:bg-[#F3ECDD]/10 font-bold'
                          }`}
                        >
                          {orderType === 'dine_in' && (
                            <div className="absolute top-1.5 right-1.5 bg-black/10 text-[#1A1208] w-4 h-4 rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 stroke-[3.5]" />
                            </div>
                          )}
                          <UtensilsCrossed className="w-5 h-5 mb-1.5" />
                          <span className="text-xs tracking-wide uppercase">{t.cart_type_dine_in}</span>
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          type="button"
                          onClick={() => setOrderType('delivery')}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-300 relative overflow-hidden ${
                            orderType === 'delivery'
                              ? 'bg-brand-orange text-[#1A1208] border-transparent font-black shadow-lg shadow-brand-orange/20'
                              : 'bg-[#F3ECDD]/5 border-[#F3ECDD]/10 text-[#C7BFB0] hover:text-[#F3ECDD] hover:bg-[#F3ECDD]/10 font-bold'
                          }`}
                        >
                          {orderType === 'delivery' && (
                            <div className="absolute top-1.5 right-1.5 bg-black/10 text-[#1A1208] w-4 h-4 rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 stroke-[3.5]" />
                            </div>
                          )}
                          <MapPin className="w-5 h-5 mb-1.5" />
                          <span className="text-xs tracking-wide uppercase">{t.cart_type_delivery}</span>
                        </motion.button>
                      </div>
                    </div>

                    {/* Cart Items List */}
                    <div className="space-y-4 overflow-y-auto max-h-[180px] mb-6 text-start border-b border-[#F3ECDD]/5 pb-4">
                      {cart.map(item => (
                        <div key={item.menuItem.id} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 rtl:space-x-reverse">
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-[#F3ECDD]/10 flex items-center justify-center bg-brand-dark">
                              <SafeImage 
                                src={item.menuItem.image} 
                                alt={item.menuItem.name[lang]} 
                                fallbackName={item.menuItem.name[lang]}
                                className="w-full h-full object-cover"
                                isCart={true}
                              />
                            </div>
                            <div>
                              <h4 className="font-bold text-xs md:text-sm text-[#F3ECDD]">{item.menuItem.name[lang]}</h4>
                              <p className="text-xs text-brand-orange font-sans font-bold">
                                {(item.menuItem as any).drinkUpgrade === 'bubble_tea' ? `${item.menuItem.price}+XX` : item.menuItem.price} {lang === 'ar' ? 'درهم' : 'MAD'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
                            <div className="flex items-center bg-[#F3ECDD]/5 rounded border border-[#F3ECDD]/10 p-0.5 text-xs font-sans">
                              <button onClick={() => removeFromCart(item.menuItem.id)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-[#F3ECDD]/10">
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <span className="w-5 text-center text-brand-orange font-bold">{item.quantity}</span>
                              <button onClick={(e) => addToCart(item.menuItem, e)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-[#F3ECDD]/10">
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                            </div>
                            <button onClick={() => deleteFromCart(item.menuItem.id)} className="text-[#7A736C] hover:text-red-500 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* One-tap Suggestions Strip */}
                    {(() => {
                      const hasDrinkInCart = cart.some(item => 
                        ['boissons_chaudes', 'jus_cocktails', 'boissons_fraiches'].includes(item.menuItem.category)
                      );
                      if (hasDrinkInCart || isSuggestionDismissed) return null;

                      const qualifyingFoodCategory = lastAddedFoodCategory || (() => {
                        const lastFoodItem = [...cart].reverse().find(item => 
                          !['boissons_chaudes', 'jus_cocktails', 'boissons_fraiches', 'viennoiserie', 'desserts'].includes(item.menuItem.category)
                        );
                        return lastFoodItem?.menuItem.category || null;
                      })();

                      if (!qualifyingFoodCategory) return null;

                      const isBreakfast = [
                        'breakfasts',
                        'omelettes',
                        'toasts',
                        'viennoiserie',
                        'crepes_sucrees',
                        'crepes_salees'
                      ].includes(qualifyingFoodCategory);

                      const suggestItems = isBreakfast
                        ? liveMenuItems.filter(i => i.category === 'boissons_chaudes')
                        : liveMenuItems.filter(i => i.category === 'jus_cocktails');

                      if (suggestItems.length === 0) return null;

                      const headingText = isBreakfast
                        ? (lang === 'ar' ? '☕ هل ترغب في إضافة مشروب ساخن؟' : lang === 'fr' ? '☕ Ajouter une boisson chaude ?' : '☕ Would you like a hot drink?')
                        : (lang === 'ar' ? '🍹 هل ترغب في إضافة عصير؟' : lang === 'fr' ? '🍹 Ajouter un jus ou cocktail ?' : '🍹 Would you like a drink?');

                      return (
                        <div className="mb-6 p-3.5 bg-[#F3ECDD]/5 border border-brand-orange/30 rounded-2xl animate-fadeIn shadow-lg shadow-black/40">
                          <div className="flex items-center justify-between mb-2.5">
                            <h4 className="text-[11px] font-black text-brand-orange uppercase tracking-wider flex items-center space-x-1.5 rtl:space-x-reverse">
                              <span>{headingText}</span>
                            </h4>
                            <button
                              onClick={() => setIsSuggestionDismissed(true)}
                              className="p-1 rounded-lg bg-[#F3ECDD]/5 hover:bg-[#F3ECDD]/10 border border-[#F3ECDD]/10 text-[#9A9490] hover:text-[#F3ECDD] transition-colors cursor-pointer"
                              title={lang === 'ar' ? 'إغلاق' : lang === 'fr' ? 'Ignorer' : 'Dismiss'}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex gap-2 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin scrollbar-thumb-brand-orange/20">
                            {suggestItems.map(drink => (
                              <button
                                key={drink.id}
                                onClick={(e) => addToCart(drink, e)}
                                className="flex-none flex items-center space-x-2 rtl:space-x-reverse bg-brand-dark hover:bg-brand-orange/20 border border-[#F3ECDD]/15 hover:border-brand-orange text-[#F3ECDD] text-xs font-bold py-2 px-3 rounded-xl transition-all active:scale-95 cursor-pointer whitespace-nowrap group"
                              >
                                <span className="text-brand-orange text-sm group-hover:scale-110 transition-transform">
                                  {isBreakfast ? '☕' : '🍹'}
                                </span>
                                <span className="text-[#E3DCCB] group-hover:text-[#F3ECDD]">
                                  {drink.name[lang] || drink.name.fr}
                                </span>
                                <span className="text-brand-orange font-sans font-black text-[10px] bg-brand-orange/10 px-1.5 py-0.5 rounded-md">
                                  +{drink.price} {lang === 'ar' ? 'د.م' : 'DH'}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Order Details Fields (Dine-in or Delivery) */}
                    {orderType === 'dine_in' ? (
                      <div className="grid grid-cols-2 gap-3 mb-6 text-start animate-fadeIn">
                        <div>
                          <label className="block text-xs font-bold text-[#C7BFB0] mb-1.5 uppercase tracking-wider">
                            {t.cart_table_number_label}
                          </label>
                          <input 
                            type="text"
                            value={tableNumber}
                            onChange={(e) => setTableNumber(e.target.value)}
                            placeholder={lang === 'ar' ? 'رقم الطاولة' : 'Ex: 5'}
                            className="w-full bg-brand-dark border border-[#F3ECDD]/15 focus:border-brand-orange focus:ring-1 focus:ring-brand-orange/30 px-3 py-2.5 rounded-lg text-base text-[#F3ECDD] placeholder-gray-600 focus:outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#C7BFB0] mb-1.5 uppercase tracking-wider">
                            {t.cart_first_name_label}
                          </label>
                          <input 
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder={t.cart_first_name_placeholder}
                            className="w-full bg-brand-dark border border-[#F3ECDD]/15 focus:border-brand-orange focus:ring-1 focus:ring-brand-orange/30 px-3 py-2.5 rounded-lg text-base text-[#F3ECDD] placeholder-gray-600 focus:outline-none transition-all"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 mb-6 text-start animate-fadeIn">
                        <div>
                          <label className="block text-xs font-bold text-[#C7BFB0] mb-1.5 uppercase tracking-wider">
                            {t.cart_first_name_label} <span className="text-brand-orange">*</span>
                          </label>
                          <input 
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder={t.cart_first_name_placeholder}
                            required
                            className="w-full bg-brand-dark border border-[#F3ECDD]/15 focus:border-brand-orange focus:ring-1 focus:ring-brand-orange/30 px-3 py-2.5 rounded-lg text-base text-[#F3ECDD] placeholder-gray-600 focus:outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#C7BFB0] mb-1.5 uppercase tracking-wider">
                            {t.cart_address_label} <span className="text-brand-orange">*</span>
                          </label>
                          <textarea 
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder={t.cart_address_placeholder}
                            rows={2}
                            required
                            className="w-full bg-brand-dark border border-[#F3ECDD]/15 focus:border-brand-orange focus:ring-1 focus:ring-brand-orange/30 p-2.5 rounded-lg text-base text-[#F3ECDD] placeholder-gray-500 focus:outline-none transition-all resize-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Calculations and Final Order Trigger */}
                  <div className="border-t border-[#F3ECDD]/10 pt-4 text-start shrink-0">
                    <div className="space-y-2 text-xs md:text-sm font-semibold mb-4">
                      <div className="flex justify-between text-[#9A9490]">
                        <span>{t.cart_subtotal}</span>
                        <span className="font-sans text-[#F3ECDD]">{formatPriceDisplay(subtotal)}</span>
                      </div>
                      
                      {orderType === 'delivery' && (
                        <div className="flex justify-between text-[#9A9490] items-center">
                          <div className="flex items-center space-x-1.5 rtl:space-x-reverse">
                            <span>{t.cart_delivery}</span>
                            <span className="text-[10px] text-brand-orange font-bold underline cursor-help group relative">
                              <Info className="w-3.5 h-3.5 inline" />
                              <span className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-brand-dark-card border border-[#F3ECDD]/15 p-2 rounded text-[10px] text-[#C7BFB0] w-44 z-50 normal-case">
                                {t.cart_delivery_note}
                              </span>
                            </span>
                          </div>
                          <span className="font-sans text-[#F3ECDD]">
                            {deliveryFee === 0 ? (
                              <span className="text-green-500 font-bold uppercase">{t.cart_free}</span>
                            ) : (
                              `${deliveryFee} ${lang === 'ar' ? 'درهم' : 'MAD'}`
                            )}
                          </span>
                        </div>
                      )}
                      
                      <div className="border-t border-[#F3ECDD]/10 pt-3 flex justify-between font-display font-black text-base md:text-lg text-[#F3ECDD]">
                        <span>{t.cart_total}</span>
                        <span className="text-brand-orange font-sans">{formatPriceDisplay(total)}</span>
                      </div>
                    </div>

                    {(() => {
                      const isDineInIncomplete = orderType === 'dine_in' && !tableNumber.trim() && !firstName.trim();
                      const isDeliveryNameIncomplete = orderType === 'delivery' && !firstName.trim();
                      const isDeliveryAddressIncomplete = orderType === 'delivery' && !address.trim();

                      if (isDineInIncomplete) {
                        return (
                          <button
                            disabled
                            className="w-full bg-[#F3ECDD]/5 border border-[#F3ECDD]/10 text-[#7A736C] py-3.5 rounded-lg font-display font-black text-xs md:text-sm text-center cursor-not-allowed flex items-center justify-center space-x-2 rtl:space-x-reverse"
                          >
                            <Phone className="w-4 h-4 shrink-0" />
                            <span>{t.cart_dine_in_hint}</span>
                          </button>
                        );
                      }

                      if (isDeliveryNameIncomplete) {
                        return (
                          <button
                            disabled
                            className="w-full bg-[#F3ECDD]/5 border border-[#F3ECDD]/10 text-[#7A736C] py-3.5 rounded-lg font-display font-black text-xs md:text-sm text-center cursor-not-allowed flex items-center justify-center space-x-2 rtl:space-x-reverse"
                          >
                            <Phone className="w-4 h-4 shrink-0" />
                            <span>{t.cart_delivery_first_name_required}</span>
                          </button>
                        );
                      }

                      if (isDeliveryAddressIncomplete) {
                        return (
                          <button
                            disabled
                            className="w-full bg-[#F3ECDD]/5 border border-[#F3ECDD]/10 text-[#7A736C] py-3.5 rounded-lg font-display font-black text-xs md:text-sm text-center cursor-not-allowed flex items-center justify-center space-x-2 rtl:space-x-reverse"
                          >
                            <Phone className="w-4 h-4 shrink-0" />
                            <span>
                              {lang === 'ar' 
                                ? 'الرجاء إدخال عنوان التوصيل' 
                                : lang === 'fr' 
                                ? 'Veuillez saisir l\'adresse' 
                                : 'Please enter delivery address'}
                            </span>
                          </button>
                        );
                      }

                      return (
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            if (orderType === 'delivery' && !firstName.trim()) {
                              alert(t.cart_delivery_first_name_required);
                              return;
                            }
                            (document.activeElement as HTMLElement)?.blur();
                            setIsCheckoutConfirmOpen(true);
                          }}
                          className="w-full bg-brand-orange hover:bg-brand-orange-hover text-[#1A1208] py-3.5 rounded-lg font-display font-black text-sm text-center transition-all flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-xl shadow-brand-orange/25 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                        >
                          <Phone className="w-4 h-4 fill-black shrink-0" />
                          <span>{t.cart_checkout_btn}</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Checkout Confirmation Modal */}
      <AnimatePresence>
        {isCheckoutConfirmOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCheckoutConfirmOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-xs z-[65] pointer-events-auto"
            />
            
            {/* Modal Container */}
            <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 pointer-events-none">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-md bg-brand-dark-card border border-[#F3ECDD]/10 rounded-2xl p-5 md:p-6 shadow-2xl pointer-events-auto text-left rtl:text-right overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-[#F3ECDD]/10 mb-4 shrink-0">
                  <h3 className="font-display font-black text-lg text-[#F3ECDD] flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-brand-orange" />
                    <span>{t.checkout_modal_title}</span>
                  </h3>
                  <button 
                    onClick={() => setIsCheckoutConfirmOpen(false)}
                    className="w-8 h-8 rounded-full bg-[#F3ECDD]/5 hover:bg-[#F3ECDD]/10 flex items-center justify-center text-[#9A9490] hover:text-[#F3ECDD] transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Info Notice Banner */}
                <div className="bg-brand-orange/10 border border-brand-orange/20 rounded-xl p-3.5 text-xs text-brand-orange flex items-start gap-2.5 mb-4 shrink-0">
                  <MessageSquare className="w-4 h-4 text-brand-orange shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{t.checkout_modal_notice}</span>
                </div>

                {/* Order Overview / Summary */}
                <div className="bg-[#F3ECDD]/5 border border-[#F3ECDD]/10 rounded-xl p-3.5 mb-5 text-xs space-y-3 overflow-y-auto custom-scrollbar grow">
                  <div className="font-bold text-[#E3DCCB] text-xs border-b border-[#F3ECDD]/10 pb-2 flex justify-between items-center">
                    <span>{t.checkout_modal_order_summary}</span>
                    <span className="text-brand-orange font-sans font-bold text-sm">{formatPriceDisplay(total)}</span>
                  </div>
                  
                  {/* Items list */}
                  <div className="space-y-2 divide-y divide-white/5">
                    {cart.map((item) => {
                      const itemTitle = item.menuItem?.name?.[lang] || item.menuItem?.name?.fr || item.menuItem?.name?.en || 'Article';
                      const unitPrice = Number(item.menuItem?.price ?? (item as any).price ?? 0) || 0;
                      const itemPrice = unitPrice * item.quantity;
                      return (
                        <div key={item.id} className="pt-1.5 first:pt-0 flex justify-between items-start text-[#C7BFB0]">
                          <div className="pr-2">
                            <span className="font-bold text-brand-orange mr-1.5">{item.quantity}x</span>
                            <span className="font-medium text-[#F3ECDD]">{itemTitle}</span>
                            {item.selectedHotDrink && (
                              <div className="text-[#9A9490] text-[11px] mt-0.5">
                                + {item.selectedHotDrink}
                              </div>
                            )}
                          </div>
                          <span className="font-sans text-[#C7BFB0] font-semibold shrink-0">{formatPriceDisplay(itemPrice)}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Fulfillment details */}
                  <div className="pt-2 border-t border-[#F3ECDD]/10 text-xs text-[#9A9490] space-y-1">
                    <div className="flex justify-between">
                      <span>{t.cart_subtotal}:</span>
                      <span className="font-sans text-[#C7BFB0]">{formatPriceDisplay(subtotal)}</span>
                    </div>
                    {orderType === 'delivery' && (
                      <div className="flex justify-between">
                        <span>{t.cart_delivery}:</span>
                        <span className="font-sans text-[#C7BFB0]">{deliveryFee === 0 ? t.cart_free : formatPriceDisplay(deliveryFee)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 font-bold text-[#E3DCCB]">
                      <span>{orderType === 'dine_in' ? t.cart_type_dine_in : t.cart_type_delivery}:</span>
                      <span className="text-brand-orange">
                        {orderType === 'dine_in'
                          ? `${tableNumber ? `${t.cart_table_number_label} ${tableNumber}` : ''} ${firstName ? `(${firstName})` : ''}`.trim() || 'Dom\'s Café'
                          : (address || 'Rabat')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="shrink-0 space-y-2">
                  <button 
                    onClick={async () => {
                      (document.activeElement as HTMLElement)?.blur();
                      setIsCheckoutConfirmOpen(false);
                      setIsOrderPlaced(true);

                      // Read tableNumber from URL query parameter "table" (e.g. ?table=7 -> "7"). If missing, use "?".
                      const urlParams = new URLSearchParams(window.location.search);
                      const tableFromUrl = urlParams.get('table')?.trim();
                      const finalTableNumber = tableFromUrl || tableNumber.trim() || '?';

                      const orderItems = cart.map(item => {
                        const unitPrice = Number(
                          item.menuItem?.price ?? 
                          (item as any).price ?? 
                          (item as any).unitPrice ?? 
                          (item as any).pricePerItem
                        ) || 0;
                        const quantity = Number(item.quantity) || 1;
                        const lineTotal = unitPrice * quantity;
                        return {
                          name: item.menuItem?.name?.fr || item.menuItem?.name?.en || 'Article',
                          quantity,
                          note: item.selectedHotDrink ? `Boisson: ${item.selectedHotDrink}` : '',
                          unitPrice,
                          lineTotal,
                          station: item.menuItem?.station || (['boissons_chaudes', 'jus_cocktails', 'boissons_fraiches'].includes(item.menuItem?.category) ? 'Bar' : 'Kitchen')
                        };
                      });
                      const orderTotal = orderItems.reduce((acc, item) => acc + item.lineTotal, 0);

                      const waUrl = getWhatsAppLink();
                      const waWindow = window.open('about:blank', '_blank');

                      try {
                        await Promise.race([
                          createFirestoreOrder(finalTableNumber, orderItems, orderTotal),
                          new Promise((resolve) => setTimeout(resolve, 1500))
                        ]);
                      } catch (err) {
                        console.warn("Firestore order write failed:", err);
                      }

                      if (waWindow) {
                        waWindow.location.href = waUrl;
                      } else {
                        window.location.href = waUrl;
                      }
                    }}
                    className="w-full bg-brand-orange hover:bg-brand-orange-hover text-[#1A1208] py-3.5 rounded-xl font-display font-black text-sm text-center transition-all flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-xl shadow-brand-orange/25 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                  >
                    <Phone className="w-4 h-4 fill-black shrink-0" />
                    <span>{t.checkout_modal_confirm_btn}</span>
                  </button>

                  <button 
                    onClick={() => setIsCheckoutConfirmOpen(false)}
                    className="w-full bg-[#F3ECDD]/5 hover:bg-[#F3ECDD]/10 border border-[#F3ECDD]/10 text-[#C7BFB0] py-3 rounded-xl font-medium text-xs text-center transition-all cursor-pointer"
                  >
                    {t.checkout_modal_cancel_btn}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Clear Cart Confirmation Dialog */}
      <AnimatePresence>
        {isClearCartConfirmOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsClearCartConfirmOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-xs z-[60] pointer-events-auto"
            />
            
            {/* Confirmation Modal */}
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-sm bg-brand-dark-card border border-[#F3ECDD]/10 rounded-2xl p-6 shadow-2xl pointer-events-auto text-center"
              >
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 text-red-500">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="font-display font-black text-lg text-[#F3ECDD] mb-2">
                  {t.cart_clear_confirm}
                </h3>
                <div className="flex space-x-3 rtl:space-x-reverse mt-6">
                  <button
                    onClick={() => setIsClearCartConfirmOpen(false)}
                    className="flex-1 bg-[#F3ECDD]/5 hover:bg-[#F3ECDD]/10 text-[#F3ECDD] font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer border border-[#F3ECDD]/10 text-xs md:text-sm active:scale-95 focus:outline-none"
                  >
                    {t.cart_clear_cancel}
                  </button>
                  <button
                    onClick={clearCart}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-[#F3ECDD] font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer text-xs md:text-sm active:scale-95 shadow-lg shadow-red-600/20 focus:outline-none"
                  >
                    {t.cart_clear_yes}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
