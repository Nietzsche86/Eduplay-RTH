import type { BossType } from '../../types/platform';

export type HeroClassId = 'knight' | 'mage' | 'archer' | 'healer' | 'rogue';
export type SpriteFrame = 'idle' | 'attack';

export interface HeroClassMeta {
  id: HeroClassId;
  name: string;
  englishName: string;
  skillName: string;
  shortPerk: string;
  description: string;
  accentColor: string;
  projectileColor: string;
  trailColor: string;
  attackStyle: 'melee_dash' | 'ranged_arc' | 'ranged_arrow' | 'support_beam' | 'double_dash';
}

export const HERO_CLASS_LIST: HeroClassMeta[] = [
  {
    id: 'knight',
    name: 'Ksatria',
    englishName: 'Knight',
    skillName: 'Tebasan Perisai',
    shortPerk: 'Perisai 2x + Kebal 25%',
    description: 'Tank Pelindung. Perisai Benteng 2x lebih tebal & meredam 25% damage Boss!',
    accentColor: '#38BDF8',
    projectileColor: '#7DD3FC',
    trailColor: '#0284C7',
    attackStyle: 'melee_dash',
  },
  {
    id: 'mage',
    name: 'Penyihir',
    englishName: 'Mage',
    skillName: 'Bola Api Sihir',
    shortPerk: 'Tembus Armor & Minion',
    description: 'Damage sihir terbesar, menembus Armor Batu Golem & damage ekstra ke Minion!',
    accentColor: '#C084FC',
    projectileColor: '#FB923C',
    trailColor: '#FDE047',
    attackStyle: 'ranged_arc',
  },
  {
    id: 'archer',
    name: 'Pemanah',
    englishName: 'Archer',
    skillName: 'Panah Cahaya',
    shortPerk: 'Crit 2x + BREAK 2x Cepat',
    description: 'Peluang Critical 2x lebih tinggi & mengisi progres BREAK Boss 2x lebih cepat!',
    accentColor: '#34D399',
    projectileColor: '#A7F3D0',
    trailColor: '#FDE047',
    attackStyle: 'ranged_arrow',
  },
  {
    id: 'healer',
    name: 'Tabib',
    englishName: 'Healer',
    skillName: 'Gelombang Cahaya',
    shortPerk: 'Heal 2x + Buff Tim +15%',
    description: 'Heal 2x lipat & padamkan api. Overheal jadi Perisai + Buff Damage Tim +15%!',
    accentColor: '#FBBF24',
    projectileColor: '#6EE7B7',
    trailColor: '#FEF08A',
    attackStyle: 'support_beam',
  },
  {
    id: 'rogue',
    name: 'Ninja',
    englishName: 'Rogue',
    skillName: 'Tebasan Bayangan 2x',
    shortPerk: 'Tebas 2x + Fever 1,6x',
    description: 'Dash menebas 2x beruntun & mengisi Combo MEGA PIXEL BEAM 1,6x lebih cepat!',
    accentColor: '#FB7185',
    projectileColor: '#F43F5E',
    trailColor: '#FCA5A5',
    attackStyle: 'double_dash',
  },
];

export const HERO_CLASS_MAP: Record<HeroClassId, HeroClassMeta> = HERO_CLASS_LIST.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<HeroClassId, HeroClassMeta>
);

export interface BossMeta {
  id: BossType;
  name: string;
  subtitle: string;
  ultimateColor: string;
  secondaryColor: string;
}

export const BOSS_META_MAP: Record<BossType, BossMeta> = {
  'inferno-dragon': {
    id: 'inferno-dragon',
    name: 'Naga Api',
    subtitle: 'Inferno Dragon',
    ultimateColor: '#F97316',
    secondaryColor: '#FEF08A',
  },
  'titan-golem': {
    id: 'titan-golem',
    name: 'Titan Golem',
    subtitle: 'Ancient Colossus',
    ultimateColor: '#F59E0B',
    secondaryColor: '#34D399',
  },
  'dark-overlord': {
    id: 'dark-overlord',
    name: 'Raja Kegelapan',
    subtitle: 'Dark Overlord',
    ultimateColor: '#A855F7',
    secondaryColor: '#F43F5E',
  },
};

type Palette = Record<string, string>;

// ============================================================
// 5 HERO PIXEL MATRICES (16x16 each, facing RIGHT)
// ============================================================

const KNIGHT_PALETTE: Palette = {
  K: '#0F172A', // dark outline
  B: '#1D4ED8', // royal blue armor
  L: '#60A5FA', // light blue highlight
  S: '#CBD5E1', // silver steel
  W: '#F8FAFC', // bright blade highlight
  D: '#475569', // dark steel visor/shadow
  G: '#FBBF24', // gold trim
  R: '#EF4444', // crimson helmet plume
  C: '#FDBA74', // skin
};

const KNIGHT_IDLE = [
  '.....RRRR.......',
  '....RRRRR.......',
  '....KSSSK.......',
  '...KSSSSSK......',
  '...KSDDDSK...W..',
  '....KCCCK...KWK.',
  '...KBBBBBK..KWS.',
  '..KLLBBBLLK.KWS.',
  '..KSSBBBSSKKWGG.',
  '..KSGBBBGSKKG...',
  '..KSSBBBSSK.....',
  '...KBBBBBK......',
  '...KDDKDDK......',
  '...KSSKSSK......',
  '..KDDK.KDDK.....',
  '..KKK...KKK.....',
];

const KNIGHT_ATTACK = [
  '......RRRR......',
  '.....RRRRR......',
  '.....KSSSK......',
  '....KSSSSSK.....',
  '....KSDDDSK.....',
  '.....KCCCK..WWWW',
  '....KBBBBBKWWSSW',
  '...KLLBBBLLGGWWK',
  '...KSSBBBSSKKG..',
  '...KSGBBBGSK....',
  '...KSSBBBSSK....',
  '....KBBBBBK.....',
  '...KDDK.KDDK....',
  '..KSSK...KSSK...',
  '..KDDK...KDDK...',
  '..KKK.....KKK...',
];

const MAGE_PALETTE: Palette = {
  K: '#0F172A',
  P: '#6D28D9', // deep purple robe
  V: '#A855F7', // bright violet
  D: '#3B0764', // dark shadow purple
  G: '#FACC15', // gold band & spark
  F: '#F97316', // flame orb
  W: '#FEF08A', // orb core
  E: '#38BDF8', // glowing eyes
  T: '#78350F', // wooden staff
};

const MAGE_IDLE = [
  '......KK........',
  '.....KPPK.......',
  '....KPVPPK......',
  '....KPPVGK..FWF.',
  '...KGGGGGGK.FWW.',
  '..KDDDDDDDDK.FK.',
  '....KKEKEK...TK.',
  '....KDDDDK...TK.',
  '...KPPVPPPK..TK.',
  '..KVVPPPPVVKKTK.',
  '..KPPPGPPPK..TK.',
  '...KPPPPPK...TK.',
  '...KPPGPPK...TK.',
  '..KDDPPPDDK..TK.',
  '..KKDDDDDKK..KK.',
  '....KKKKK.......',
];

const MAGE_ATTACK = [
  '.......KK.......',
  '......KPPK......',
  '.....KPVPPK.WFW.',
  '.....KPPVGKFWWWF',
  '....KGGGGGGKFFWK',
  '...KDDDDDDDDKFK.',
  '.....KKEKEK.TK..',
  '.....KDDDDKKT...',
  '....KPPVPPPK....',
  '...KVVPPPPVVKK..',
  '...KPPPGPPPK....',
  '...KPPPPPK......',
  '..KDDPPPGPK.....',
  '..KKDDDDDKK.....',
  '....KK.KK.......',
  '................',
];

const ARCHER_PALETTE: Palette = {
  K: '#0F172A',
  G: '#047857', // forest emerald hood
  E: '#34D399', // bright emerald trim
  D: '#064E3B', // deep emerald shadow
  C: '#FDBA74', // skin
  B: '#92400E', // wooden bow/quiver
  L: '#D97706', // light wood
  Y: '#FEF08A', // glowing light arrow
  W: '#ECFDF5', // arrow tip glow
};

const ARCHER_IDLE = [
  '....KKKKK.......',
  '...KGGGGGKK.....',
  '..KGGEEEGGK.....',
  '..KGDCCCDGK..BL.',
  '..KGDCKCCGK...BL',
  '...KGGGGGKK...BL',
  '..KBBGGGGGK...BL',
  '..KBGEEGGGK.YYWW',
  '...KGGGGGGKK..BL',
  '...KGBBGGGK...BL',
  '...KGGGGGKK..BL.',
  '...KDDKDDK......',
  '...KGGKGGK......',
  '..KBBK.KBBK.....',
  '..KKK...KKK.....',
  '................',
];

const ARCHER_ATTACK = [
  '.....KKKKK......',
  '....KGGGGGKK....',
  '...KGGEEEGGK.BL.',
  '...KGDCCCDGK..BL',
  '...KGDCKCCGK...B',
  '....KGGGGGKK...B',
  '...KBBGGGGGKYYYY',
  '...KBGEEGGGKYYWW',
  '....KGGGGGGK...B',
  '....KGBBGGGK..BL',
  '....KGGGGGKK.BL.',
  '...KDDK.KDDK....',
  '..KGGK...KGGK...',
  '..KBBK...KBBK...',
  '..KKK.....KKK...',
  '................',
];

const HEALER_PALETTE: Palette = {
  K: '#0F172A',
  W: '#F8FAFC', // pure white robe
  S: '#E2E8F0', // soft silver shading
  G: '#FBBF24', // royal gold trim & halo
  Y: '#FEF08A', // bright gold glow
  E: '#10B981', // emerald healing crystal
  M: '#6EE7B7', // bright mint glow
  C: '#FED7AA', // skin
};

const HEALER_IDLE = [
  '....GGGGGG......',
  '...KYYYYYYK..M..',
  '....KWWWWK..MEM.',
  '...KWCCCCWK..M..',
  '...KWCKCCWK..G..',
  '....KWWWWK...G..',
  '...KWGGGGWK..G..',
  '..KWWWEEWWWK.G..',
  '..KSWWEEWWSKKG..',
  '..KSWWGGWWSK.G..',
  '...KWWWWWWK..G..',
  '...KSWWWWSK..G..',
  '..KSSWWWWSSK.G..',
  '..KGGWWWWGGK.K..',
  '...KKKKKKKK.....',
  '................',
];

const HEALER_ATTACK = [
  '....GGGGGG..YMY.',
  '...KYYYYYYKMMEMM',
  '....KWWWWK.MMEMM',
  '...KWCCCCWK.YGY.',
  '...KWCKCCWK..G..',
  '....KWWWWK..KG..',
  '...KWGGGGWKKG...',
  '..KWWWEEWWWK....',
  '..KSWWEEWWSK....',
  '..KSWWGGWWSK....',
  '...KWWWWWWK.....',
  '...KSWWWWSK.....',
  '..KSSWWWWSSK....',
  '..KGGWWWWGGK....',
  '...KKKKKKKK.....',
  '................',
];

const ROGUE_PALETTE: Palette = {
  K: '#020617', // obsidian black
  N: '#1E293B', // midnight ninja cloth
  D: '#334155', // dark slate highlight
  R: '#EF4444', // vivid crimson scarf/band
  L: '#FB7185', // crimson glint
  S: '#E2E8F0', // steel blade
  W: '#FFFFFF', // razor shine
  C: '#FDBA74', // eyes strip
};

const ROGUE_IDLE = [
  '.....KKKKK......',
  '....KNNNNNK.....',
  '...KRRRRRRRK....',
  '..RKNNCCNNNK....',
  '.RRKNNKCNNNK..W.',
  '....KRRRRRK..WS.',
  '..RRKNNNNNK.KWS.',
  '.RRKNNDNNNKKNK..',
  '...KNNRNNNK.....',
  '...KNNNNNK......',
  '...KNNKNNK......',
  '..KNNK.KNNK.....',
  '..KRRK.KRRK.....',
  '..KNNK.KNNK.....',
  '..KKK...KKK.....',
  '................',
];

const ROGUE_ATTACK = [
  '......KKKKK.....',
  '.....KNNNNNK..LL',
  '....KRRRRRRRKWWL',
  '..RRKNNCCNNNKSWW',
  'RRR.KNNKCNNNKKSL',
  '.....KRRRRRK....',
  '..RRKNNNNNK..WSS',
  '.RRKNNDNNNKKWWLL',
  '....KNNRNNNK....',
  '...KNNK.KNNK....',
  '..KNNK...KNNK...',
  '..KRRK...KRRK...',
  '..KNNK...KNNK...',
  '..KKK.....KKK...',
  '................',
  '................',
];

// ============================================================
// 3 PIXEL BOSS MATRICES (32x32 each, facing LEFT)
// ============================================================

const DRAGON_PALETTE: Palette = {
  K: '#18090B', // deep outline
  R: '#DC2626', // dragon crimson scales
  D: '#7F1D1D', // dark burgundy wing/shadow
  O: '#F97316', // bright fiery orange
  Y: '#FACC15', // golden horns & eyes
  W: '#FEF9C3', // molten white-yellow fire
  B: '#991B1B', // wing membrane
  S: '#450A0A', // deep shadow
};

const DRAGON_IDLE = [
  '..................KKK....KKK....',
  '.................KYYK...KYYK....',
  '........KKK.....KYYK...KYYK.....',
  '.......KYYK....KRRKK..KRRK......',
  '......KYYK....KRRRRKKRRRRK......',
  '.....KRRKKK..KRRRRRRRRRRRK..KK..',
  '....KRRRRRRKKRRDDBBBRRRRRKKKDDK.',
  '...KRRRRRRRRRRDBBBBBBRRRRRDDDDK.',
  '..KRRRRYYRRRRDBBBBBBBRRRRDDDDDK.',
  '.KRRRRYWYRRRRDBBBBBBBBRRRDDDDKK.',
  '.KRRRRRRRRRRRDBBBBBBBRRRRDDDKK..',
  '..KKKRRRRRRRRRDBBBBBBRRRRDDKK...',
  '.....KKKRRRRRRDDBBBBRRRRRDKK....',
  '....KWWWKRRRRRRDDDDRRRRRRRK.....',
  '....KKKKRRRRRRRRRRRRRRRRRRK.....',
  '......KOOYRRRRRRRRRRRRRRRRK.....',
  '.....KOOYYRRRRRRRRRRRRRRRRK.....',
  '.....KOOYYRRRRRRRRRRRRRRRRRK....',
  '.....KOOYRRRRRRRRRRDDRRRRRRK....',
  '......KOOYRRRRRRRRDDDRRRRRRRK...',
  '......KOOYRRRRRRRRDDDRRRRRRRRK..',
  '.......KOOYRRRRRRDDDRRRRRRRRRRK.',
  '......KRRKRRRRRRRDRRRRRRKKRRRRRK',
  '.....KRRRKRRRRRRRRRRRRRK..KRRRRK',
  '....KYYRRKRRRRRRRRRRRRK....KRRK.',
  '....KKKKK.KRRRRRRRRRRK.....KYYK.',
  '..........KRRRRKKRRRRK......KK..',
  '.........KRRRRK..KRRRRK.........',
  '........KRRRRK....KRRRRK........',
  '.......KYYRRK......KYYRRK.......',
  '.......KKKKK........KKKKK.......',
  '................................',
];

const DRAGON_ATTACK = [
  '.................KKK....KKK.....',
  '................KYYK...KYYK.....',
  '.......KKK.....KYYK...KYYK..KKK.',
  '......KYYK....KRRKK..KRRKKKDDDDK',
  '.....KYYK....KRRRRKKRRRRKDDDDDDK',
  '....KRRKKK..KRRRRRRRRRRKDDDBBBBK',
  '...KRRRRRRKKRRRRRRRRRRKDDDBBBBBK',
  '..KRRRRRRRRRRRRRRRRRRKDDDBBBBBBK',
  '.KRRRRYYRRRRRRRRRRRRKDDDBBBBBBKK',
  'KRRRRYWYRRRRRRRRRRRRKDDDBBBBBKK.',
  'KRRRRRRRRRRRRRRRRRRRKDDDBBBBKK..',
  'WWOOOKKRRRRRRRRRRRRRRDDDDDDKK...',
  'WWYOOOKRRRRRRRRRRRRRRRDDDDKK....',
  'WWYOOOKKRRRRRRRRRRRRRRRRRRK.....',
  '.WWOOO.KRRRRRRRRRRRRRRRRRRK.....',
  '..KKK.KOOYRRRRRRRRRRRRRRRRK.....',
  '.....KOOYYRRRRRRRRRRRRRRRRRK....',
  '.....KOOYYRRRRRRRRRRRRRRRRRK....',
  '.....KOOYRRRRRRRRRRDDRRRRRRRK...',
  '......KOOYRRRRRRRRDDDRRRRRRRRK..',
  '......KOOYRRRRRRRRDDDRRRRRRRRRK.',
  '.....KRRRKRRRRRRRDDDRRRRRRRRRRRK',
  '....KYYRRKRRRRRRRRRRRRRRKKRRRRRK',
  '....KKKKK.KRRRRRRRRRRRRK..KRRRRK',
  '..........KRRRRRRRRRRRK....KRRK.',
  '.........KRRRRRKKRRRRRK....KYYK.',
  '........KRRRRK....KRRRRK....KK..',
  '.......KRRRRK......KRRRRK.......',
  '......KYYRRK........KYYRRK......',
  '......KKKKK..........KKKKK......',
  '................................',
  '................................',
];

const GOLEM_PALETTE: Palette = {
  K: '#0F172A', // deep slate outline
  S: '#64748B', // main stone
  L: '#94A3B8', // light stone highlight
  D: '#334155', // dark stone shadow
  M: '#10B981', // glowing emerald moss/runes
  E: '#34D399', // bright rune glow
  A: '#F59E0B', // molten amber core
  Y: '#FEF08A', // core center glow
};

const GOLEM_IDLE = [
  '..........KKKKKKKKKKKK..........',
  '........KKLLLLLLLLLLLLKK........',
  '.......KLLSSMMSSSSMMSSLLK.......',
  '......KLLSSSEESSSSEESSSLLK......',
  '......KSSSSSDDDDDDDSSSSSSK......',
  '......KSSSDAAYYKYYAADSSSSK......',
  '......KSSSDDDDDDDDDDDSSSSK......',
  '....KKKLLLLSSSSSSSSSSLLLLKKK....',
  '...KLLLSSSSSSSMMMMSSSSSSSLLLK...',
  '..KLLSSSMMSSSSSEESSSSSMMSSSLLK..',
  '..KLLSSSEESSSSSDDSSSSSEESSSLLK..',
  '.KLLSSSSSSSDDDAAAADDDSSSSSSSLLK.',
  '.KLLSSSDDDSSSDAAYYADSSSDDDSSLLK.',
  '.KSSSSSDDDSSSDAAYYADSSSDDDSSSSK.',
  '.KSSSSSDDDSSSDDAAAADDSSDDDSSSSK.',
  '.KSDDDDDDDSSSDDDDDDDSSSDDDDDDSK.',
  '.KSDDDDKSSSSSMMMMMMSSSSSKDDDDSK.',
  '.KSDDDDKSSSSSSSEESSSSSSSKDDDDSK.',
  '.KSSDDDKSSSSSSSSSSSSSSSSKDDDSSK.',
  '.KLLDDDKSDDDSSSSSSSSDDDSKDDDLLK.',
  '.KLLDDDKSDDDSSSSSSSSDDDSKDDDLLK.',
  '..KDDDDKSDDDDDDDDDDDDDDSKDDDDK..',
  '...KKKK.KDDDDDDDDDDDDDDK.KKKK...',
  '........KSSSSSDDDSSSSSSK........',
  '........KSSSSSDDDSSSSSSK........',
  '.......KLLSSSSK.KSSSSLLK........',
  '.......KSSSSSSK.KSSSSSSK........',
  '.......KSDDDDSK.KSDDDDSK........',
  '......KLLSSSSSK.KSSSSSLLK.......',
  '......KDDDDDDDK.KDDDDDDDK.......',
  '......KKKKKKKKK.KKKKKKKKK.......',
  '................................',
];

const GOLEM_ATTACK = [
  '..........KKKKKKKKKKKK..........',
  '........KKLLLLLLLLLLLLKK........',
  '.......KLLSSMMSSSSMMSSLLK.......',
  '......KLLSSSEESSSSEESSSLLK......',
  '......KSSSSSDDDDDDDSSSSSSK......',
  '......KSSSDYYYYKYYYYDSSSSK......',
  '......KSSSDDDDDDDDDDDSSSSK......',
  '....KKKLLLLSSSSSSSSSSLLLLKKK....',
  '..KKLLLSSSSSSSMMMMSSSSSSSLLLK...',
  '.KLLSSSSMMSSSSSEESSSSSMMSSSLLK..',
  'KYYAALSSSEESSSSDDSSSSSEESSSLLK..',
  'KYYAALSSSSSDDDYYYYDDDSSSSSSSLLK.',
  'KAAALLSDDDSSSDYYYYADSSSDDDSSLLK.',
  'KLLLLLSDDDSSSDYYYYADSSSDDDSSSSK.',
  '.KSSSSSDDDSSSDDAAAADDSSDDDSSSSK.',
  '..KDDDDDDDSSSDDDDDDDSSSDDDDDDSK.',
  '...KKKKKSSSSSMMMMMMSSSSSKDDDDSK.',
  '.......KSSSSSSSEESSSSSSSKDDDDSK.',
  '.......KSSSSSSSSSSSSSSSSKDDDSSK.',
  '.......KSDDDSSSSSSSSDDDSKDDDLLK.',
  '.......KSDDDSSSSSSSSDDDSKDDDLLK.',
  '.......KSDDDDDDDDDDDDDDSKDDDDK..',
  '........KDDDDDDDDDDDDDDK.KKKK...',
  '........KSSSSSDDDSSSSSSK........',
  '.......KLLSSSSK.KSSSSLLK........',
  '.......KSSSSSSK.KSSSSSSK........',
  '......KLLSDDDSK.KSDDDSLLK.......',
  '......KSSSSSSSK.KSSSSSSSK.......',
  '.....KDDDDDDDDK.KDDDDDDDDK......',
  '.....KKKKKKKKKK.KKKKKKKKKK......',
  '................................',
  '................................',
];

const OVERLORD_PALETTE: Palette = {
  K: '#090514', // void black outline
  P: '#4C1D95', // dark royal indigo
  V: '#A855F7', // bright violet energy
  M: '#E879F9', // glowing magenta
  R: '#BE123C', // crimson cloak lining
  G: '#FACC15', // cursed gold crown
  W: '#FAF5FF', // bright magic core
  S: '#1E1B4B', // deep shadow armor
};

const OVERLORD_IDLE = [
  '............K......K............',
  '...........KGK....KGK...........',
  '..........KGGK.KK.KGGK..........',
  '..........KGGGKGGKGGGK..........',
  '..........KGGGGGGGGGGK..........',
  '..........KSSSSSSSSSSK..........',
  '.........KSSKVVKKVVKSSK.........',
  '.........KSSKVWKKWVKSSK.........',
  '.........KSSSSSSSSSSSSK.........',
  '.....W....KKSSSSSSSSKK..........',
  '....WMW....KPPGGGGPPK...........',
  '...WMMMW..KPPPPRRPPPPK..........',
  '....WMW..KPPVVPRRPVVPPK.........',
  '.....V..KPPPPPPRRPPPPPPK........',
  '.....V.KPPPPPPPRRPPPPPPPK.......',
  '.....V.KPPSSPPPRRPPPSSPPK.......',
  '.....V.KPPSSPPPRRPPPSSPPK.......',
  '.....V..KKSSPPPRRPPPSSKK........',
  '.....G....KPPPPRRPPPPK..........',
  '.....V....KPPPPRRPPPPK..........',
  '.....V...KPPPPPRRPPPPPK.........',
  '.....V...KPPVVPRRPVVPPK.........',
  '.....K..KPPPPPPRRPPPPPPK........',
  '........KPPPPPPRRPPPPPPK........',
  '.......KPPPRRRPRRPRRRPPPK.......',
  '.......KPPKRRRPRRPRRRKPPK.......',
  '......KPPK.KRRKRRKRRK.KPPK......',
  '......KKK..KPK.KK.KPK..KKK......',
  '...........KK......KK...........',
  '..........VV........VV..........',
  '................................',
  '................................',
];

const OVERLORD_ATTACK = [
  '..W.........K......K............',
  '.WMW.......KGK....KGK...........',
  'WMMMW.....KGGK.KK.KGGK..........',
  'WMWMW.....KGGGKGGKGGGK..........',
  '.WMW......KGGGGGGGGGGK..........',
  '..V.......KSSSSSSSSSSK..........',
  '..V......KSSKMMKKMMKSSK.........',
  '..V......KSSKMWKKWMKSSK.........',
  '..V......KSSSSSSSSSSSSK.........',
  '..V.......KKSSSSSSSSKK..........',
  '..V..KK....KPPGGGGPPK...........',
  '..VVVVVK..KPPPPRRPPPPK..........',
  '...GGGGK.KPPVVPRRPVVPPK.........',
  '....KPPKKPPPPPPRRPPPPPPK........',
  '.....KKKPPPPPPPRRPPPPPPPK.......',
  '.......KPPSSPPPRRPPPSSPPK.......',
  '.......KPPSSPPPRRPPPSSPPK.......',
  '........KKSSPPPRRPPPSSKK........',
  '.........KPPPPPRRPPPPPK.........',
  '........KPPVVVPRRPVVVPPK........',
  '.......KPPPPPPPRRPPPPPPPK.......',
  '.......KPPPPPPRRRRPPPPPPK.......',
  '......KPPPPRRRPRRPRRRPPPPK......',
  '......KPPKKRRRPRRPRRRKKPPK......',
  '.....KPPK..KRRKRRKRRK..KPPK.....',
  '.....KKK...KPK.KK.KPK...KKK.....',
  '...........KK......KK...........',
  '........VVV..........VVV........',
  '.......VMMV..........VMMV.......',
  '........VV............VV........',
  '................................',
  '................................',
];

// ============================================================
// SMALL PIXEL PROPS (8x8)
// ============================================================
const PROP_HEART = [
  '.RR..RR.',
  'RWWWRRRR',
  'RWRRRRRR',
  'RRRRRRRR',
  '.RRRRRR.',
  '..RRRR..',
  '...RR...',
  '........',
];
const PROP_HEART_PALETTE: Palette = { R: '#10B981', W: '#A7F3D0' };

const PROP_SHIELD = [
  '.GGGGGG.',
  'GBBBBBBG',
  'GBWWBBBG',
  'GBWBBBBG',
  'GBBBBBBG',
  '.GBBBBG.',
  '..GBBG..',
  '...GG...',
];
const PROP_SHIELD_PALETTE: Palette = { G: '#FBBF24', B: '#38BDF8', W: '#E0F2FE' };

const PROP_STAR = [
  '...YY...',
  '...YY...',
  '.YYYYYY.',
  'YYWWWWYY',
  '.YYYYYY.',
  '..YYYY..',
  '.YY..YY.',
  '........',
];
const PROP_STAR_PALETTE: Palette = { Y: '#FACC15', W: '#FEF9C3' };

const HERO_MATRICES: Record<HeroClassId, { palette: Palette; idle: string[]; attack: string[] }> = {
  knight: { palette: KNIGHT_PALETTE, idle: KNIGHT_IDLE, attack: KNIGHT_ATTACK },
  mage: { palette: MAGE_PALETTE, idle: MAGE_IDLE, attack: MAGE_ATTACK },
  archer: { palette: ARCHER_PALETTE, idle: ARCHER_IDLE, attack: ARCHER_ATTACK },
  healer: { palette: HEALER_PALETTE, idle: HEALER_IDLE, attack: HEALER_ATTACK },
  rogue: { palette: ROGUE_PALETTE, idle: ROGUE_IDLE, attack: ROGUE_ATTACK },
};

const BOSS_MATRICES: Record<BossType, { palette: Palette; idle: string[]; attack: string[] }> = {
  'inferno-dragon': { palette: DRAGON_PALETTE, idle: DRAGON_IDLE, attack: DRAGON_ATTACK },
  'titan-golem': { palette: GOLEM_PALETTE, idle: GOLEM_IDLE, attack: GOLEM_ATTACK },
  'dark-overlord': { palette: OVERLORD_PALETTE, idle: OVERLORD_IDLE, attack: OVERLORD_ATTACK },
};

const canvasCache = new Map<string, HTMLCanvasElement>();
const dataUrlCache = new Map<string, string>();

function renderMatrixToCanvas(
  matrix: string[],
  palette: Palette,
  overrideColor?: string
): HTMLCanvasElement {
  const height = matrix.length;
  const width = matrix[0]?.length || 16;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < height; y++) {
    const row = matrix[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const color = overrideColor || palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

export function getHeroSpriteCanvas(
  heroClass: HeroClassId,
  frame: SpriteFrame = 'idle',
  flashWhite = false
): HTMLCanvasElement {
  const safeClass: HeroClassId = HERO_MATRICES[heroClass] ? heroClass : 'knight';
  const key = `hero:${safeClass}:${frame}:${flashWhite ? 'w' : 'c'}`;
  const existing = canvasCache.get(key);
  if (existing) return existing;

  const def = HERO_MATRICES[safeClass];
  const matrix = frame === 'attack' ? def.attack : def.idle;
  const canvas = renderMatrixToCanvas(matrix, def.palette, flashWhite ? '#FFFFFF' : undefined);
  canvasCache.set(key, canvas);
  return canvas;
}

export function getBossSpriteCanvas(
  bossType: BossType,
  frame: SpriteFrame = 'idle',
  flashWhite = false
): HTMLCanvasElement {
  const safeBoss: BossType = BOSS_MATRICES[bossType] ? bossType : 'inferno-dragon';
  const key = `boss:${safeBoss}:${frame}:${flashWhite ? 'w' : 'c'}`;
  const existing = canvasCache.get(key);
  if (existing) return existing;

  const def = BOSS_MATRICES[safeBoss];
  const matrix = frame === 'attack' ? def.attack : def.idle;
  const canvas = renderMatrixToCanvas(matrix, def.palette, flashWhite ? '#FFFFFF' : undefined);
  canvasCache.set(key, canvas);
  return canvas;
}

export function getPropSpriteCanvas(prop: 'heart' | 'shield' | 'star'): HTMLCanvasElement {
  const key = `prop:${prop}`;
  const existing = canvasCache.get(key);
  if (existing) return existing;

  let canvas: HTMLCanvasElement;
  if (prop === 'heart') {
    canvas = renderMatrixToCanvas(PROP_HEART, PROP_HEART_PALETTE);
  } else if (prop === 'shield') {
    canvas = renderMatrixToCanvas(PROP_SHIELD, PROP_SHIELD_PALETTE);
  } else {
    canvas = renderMatrixToCanvas(PROP_STAR, PROP_STAR_PALETTE);
  }
  canvasCache.set(key, canvas);
  return canvas;
}

/**
 * Returns a crisp scaled PNG data URL (rendered offline via offscreen canvas)
 * for use inside <img> tags with CSS `image-rendering: pixelated`.
 */
export function getHeroPreviewDataUrl(
  heroClass: HeroClassId,
  frame: SpriteFrame = 'idle',
  scale = 4
): string {
  const safeClass: HeroClassId = HERO_MATRICES[heroClass] ? heroClass : 'knight';
  const key = `url:hero:${safeClass}:${frame}:${scale}`;
  const cached = dataUrlCache.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') return '';
  const src = getHeroSpriteCanvas(safeClass, frame, false);
  const out = document.createElement('canvas');
  out.width = src.width * scale;
  out.height = src.height * scale;
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, out.width, out.height);
  }
  const url = out.toDataURL('image/png');
  dataUrlCache.set(key, url);
  return url;
}

export function getBossPreviewDataUrl(
  bossType: BossType,
  frame: SpriteFrame = 'idle',
  scale = 4
): string {
  const safeBoss: BossType = BOSS_MATRICES[bossType] ? bossType : 'inferno-dragon';
  const key = `url:boss:${safeBoss}:${frame}:${scale}`;
  const cached = dataUrlCache.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') return '';
  const src = getBossSpriteCanvas(safeBoss, frame, false);
  const out = document.createElement('canvas');
  out.width = src.width * scale;
  out.height = src.height * scale;
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, out.width, out.height);
  }
  const url = out.toDataURL('image/png');
  dataUrlCache.set(key, url);
  return url;
}
