// チームロゴ（owcdn.net の URL）をサイトに置くときのファイル名とパス（fetch-logos.mjs と merge-matches.mjs で使う）
export const LOGO_DIR = '/assets/vct/teams/';

// 'https://owcdn.net/img/62875027c8e06.png' → '62875027c8e06.png'（owcdn.net の画像でなければ ''）
export const logoFile = (url = '') => url.match(/^https:\/\/owcdn\.net\/img\/([\w-]+\.(?:png|jpe?g|webp|svg))$/)?.[1] ?? '';
