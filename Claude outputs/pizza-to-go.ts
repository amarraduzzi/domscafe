// "Dom's To Go" -- a new grab-and-go sub-line (rectangular pizza + pasta
// cups, sold individually, to eat on the spot or take away), announced as a
// marketing concept on this page while the recipes/production and final
// prices are still being finalized (client's own instruction, 23/09/2026:
// "die prijzen moet je helemaal vergeten en eruit halen die worden achteraf
// bepaald"). This is a NEW, separate line from `pizza-showcase.ts`'s 9 real
// menu pizzas -- those stay exactly as-is, unchanged, they're what's
// actually sold and orderable today via domscafe.pages.dev. This file is
// announcement-only content: no `priceMAD` and no order link per item
// (nothing here is sellable yet). `image` is set item-by-item as the
// client's AI-generated visuals come in (see PizzaContent.astro's
// "Dom's To Go" section for how a missing image degrades gracefully to a
// colored icon card instead of a broken <img>); the source images were
// cropped to drop their baked-in title/ingredient text and logo (that text
// duplicates what the card already renders as real, translatable copy) --
// the original flyer versions are kept at
// public/images/dom/to-go/flyer-*.webp for reuse on social media.
import type { LocalizedText } from '../i18n/languages';

export interface ToGoItem {
  /** Stable slug, e.g. for a future image filename (to-go/pizza-red.webp). */
  key: string;
  category: 'pizza' | 'pasta';
  /** Kept in Latin script across all 3 languages -- it's a product name
      ("The Red"), not a description, same convention as pizza-showcase.ts's
      `name` field. */
  name: string;
  tag?: LocalizedText;
  ingredients: LocalizedText;
  /** Set once the client's AI-generated visuals exist -- see header comment. */
  image?: string;
}

export const pizzaToGo: ToGoItem[] = [
  {
    key: 'pizza-red',
    category: 'pizza',
    name: 'The Red',
    tag: { fr: 'Classique', en: 'Classic', ar: 'كلاسيكية' },
    ingredients: {
      fr: 'Tomate, mozzarella, basilic.',
      en: 'Tomato, mozzarella, basil.',
      ar: 'طماطم، موزاريلا، ريحان.',
    },
    image: '/images/dom/to-go/pizza-red.webp',
  },
  {
    key: 'pizza-red-hot',
    category: 'pizza',
    name: 'The Red Hot',
    tag: { fr: 'Épicée', en: 'Spicy', ar: 'حارة' },
    ingredients: {
      fr: 'Tomate, mozzarella, piment.',
      en: 'Tomato, mozzarella, chili.',
      ar: 'طماطم، موزاريلا، فلفل حار.',
    },
    image: '/images/dom/to-go/pizza-red-hot.webp',
  },
  {
    key: 'pizza-gold',
    category: 'pizza',
    name: 'The Gold',
    ingredients: {
      fr: 'Merguez, safran, parmesan, oignon croustillant.',
      en: 'Merguez, saffron, parmesan, crispy onion.',
      ar: 'مرقاز، زعفران، بارميزان، بصل مقرمش.',
    },
  },
  {
    key: 'pizza-green',
    category: 'pizza',
    name: 'The Green',
    ingredients: {
      fr: 'Pesto, courgette, pistache.',
      en: 'Pesto, courgette, pistachio.',
      ar: 'بيستو، كوسة، فستق.',
    },
  },
  {
    key: 'pasta-red',
    category: 'pasta',
    name: 'The Red',
    tag: { fr: 'Classique ou épicée', en: 'Classic or hot', ar: 'كلاسيكية أو حارة' },
    ingredients: {
      fr: 'Tomate rôtie, bœuf, stracciatella, basilic.',
      en: 'Roasted tomato, beef, stracciatella, basil.',
      ar: 'طماطم مشوية، لحم بقري، ستراتشاتيلا، ريحان.',
    },
  },
  {
    key: 'pasta-gold',
    category: 'pasta',
    name: 'The Gold',
    ingredients: {
      fr: 'Safran, merguez, parmesan, oignon croustillant.',
      en: 'Saffron, merguez, parmesan, crispy onion.',
      ar: 'زعفران، مرقاز، بارميزان، بصل مقرمش.',
    },
  },
];
