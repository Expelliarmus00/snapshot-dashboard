/**
 * Répertoire des apps du portail Snapshot Media.
 * Chaque entrée = une carte sur la page d'accueil. Pour ajouter une app,
 * déposer son front dans public/apps/<slug>/ et l'enregistrer ici.
 */
export interface AppEntry {
  slug: string;
  name: string;
  tagline: string;
  href: string;
  icon: string; // clé d'icône Lucide (voir public/index.html)
  status: 'live' | 'soon';
  accent?: boolean;
}

export const APPS: AppEntry[] = [
  {
    slug: 'patrimoine',
    name: 'Patrimoine immobilier',
    tagline: 'Financement, cash-flow & amortissement 3a — Auboranges (FR)',
    href: '/apps/patrimoine/',
    icon: 'house',
    status: 'live',
    accent: true,
  },
];
