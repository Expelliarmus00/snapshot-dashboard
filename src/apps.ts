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
  category: 'media' | 'prive'; // « Snapshot Media » (métier) ou « Privé » (perso)
  accent?: boolean;
  repo?: string; // URL du repo GitHub (menu actions rapides)
}

export const APPS: AppEntry[] = [
  {
    slug: 'patrimoine',
    name: 'Patrimoine immobilier',
    tagline: 'Financement, cash-flow & amortissement 3a — Auboranges (FR)',
    href: 'https://patrimoine.snapshotmedia.ch',
    icon: 'house',
    status: 'live',
    category: 'prive',
    accent: true,
    repo: 'https://github.com/Expelliarmus00/snapshot-patrimoine',
  },
];
