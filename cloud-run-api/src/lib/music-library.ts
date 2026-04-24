export type MusicMood =
  | 'warm'
  | 'energetic'
  | 'cinematic'
  | 'ambient'
  | 'ugc_authentic'
  | 'luxury';

export interface MusicTrackSeed {
  id: string;
  name: string;
  mood: MusicMood;
  sub_moods: string[];
  tempo_bpm: number;
  duration_sec: number;
  instruments: string[];
  use_cases: string[];
  musicgen_prompt: string;
}

export const MUSIC_LIBRARY_SEED: MusicTrackSeed[] = [
  // warm (4) — testimonial, founder story, ugc intimate
  {
    id: 'warm_acoustic_morning',
    name: 'Warm Acoustic Morning',
    mood: 'warm',
    sub_moods: ['acoustic', 'peaceful'],
    tempo_bpm: 85,
    duration_sec: 30,
    instruments: ['acoustic_guitar', 'piano'],
    use_cases: ['testimonial_founder', 'ugc_authentic'],
    musicgen_prompt:
      'warm acoustic guitar with soft piano, peaceful morning coffee vibe, 85 bpm, latin american folk inspiration, no vocals',
  },
  {
    id: 'warm_folk_storytelling',
    name: 'Folk Storytelling',
    mood: 'warm',
    sub_moods: ['folk', 'narrative'],
    tempo_bpm: 92,
    duration_sec: 30,
    instruments: ['acoustic_guitar', 'mandolin', 'light_drums'],
    use_cases: ['brand_story', 'mofu_narrative'],
    musicgen_prompt:
      'warm folk storytelling, acoustic guitar and mandolin, light brush drums, intimate storytelling vibe, 92 bpm, no vocals',
  },
  {
    id: 'warm_intimate_piano',
    name: 'Intimate Piano',
    mood: 'warm',
    sub_moods: ['piano', 'emotional'],
    tempo_bpm: 78,
    duration_sec: 30,
    instruments: ['solo_piano', 'subtle_strings'],
    use_cases: ['emotional_testimonial', 'bofu_trust'],
    musicgen_prompt:
      'emotional solo piano with subtle warm strings, intimate close confessional feeling, 78 bpm, no vocals',
  },
  {
    id: 'warm_latin_sunset',
    name: 'Latin Sunset',
    mood: 'warm',
    sub_moods: ['latin_acoustic', 'golden_hour'],
    tempo_bpm: 95,
    duration_sec: 30,
    instruments: ['nylon_guitar', 'soft_percussion'],
    use_cases: ['lifestyle_latam', 'warm_ugc'],
    musicgen_prompt:
      'warm latin nylon guitar, soft cajón percussion, golden hour sunset vibe, latinoamerican cafe atmosphere, 95 bpm, no vocals',
  },

  // energetic (4) — bold statements, hooks, energetic CTA
  {
    id: 'energetic_upbeat_pop',
    name: 'Upbeat Pop Hook',
    mood: 'energetic',
    sub_moods: ['pop', 'punchy'],
    tempo_bpm: 120,
    duration_sec: 30,
    instruments: ['synth_bass', 'electric_guitar', 'drums'],
    use_cases: ['bold_statement', 'tofu_hook'],
    musicgen_prompt:
      'punchy upbeat pop with driving synth bass, bright electric guitar, tight drums, optimistic energy, 120 bpm, no vocals',
  },
  {
    id: 'energetic_latin_fusion',
    name: 'Latin Fusion Drive',
    mood: 'energetic',
    sub_moods: ['latin', 'reggaeton_inspired'],
    tempo_bpm: 105,
    duration_sec: 30,
    instruments: ['808_bass', 'latin_percussion', 'synth'],
    use_cases: ['call_out_angle', 'tofu_hook_latam'],
    musicgen_prompt:
      'energetic latin fusion with 808 bass, reggaeton inspired percussion, bright synth stabs, modern latinoamerican pop energy, 105 bpm, no vocals',
  },
  {
    id: 'energetic_workout_build',
    name: 'Workout Build',
    mood: 'energetic',
    sub_moods: ['electronic', 'high_energy'],
    tempo_bpm: 128,
    duration_sec: 30,
    instruments: ['electronic_drums', 'supersaw', 'bass'],
    use_cases: ['product_reveal', 'before_after'],
    musicgen_prompt:
      'high energy electronic build with driving electronic drums, supersaw synths, aggressive bass, climactic buildup, 128 bpm, no vocals',
  },
  {
    id: 'energetic_indie_rush',
    name: 'Indie Rush',
    mood: 'energetic',
    sub_moods: ['indie_rock', 'uplifting'],
    tempo_bpm: 118,
    duration_sec: 30,
    instruments: ['electric_guitar', 'live_drums', 'bass'],
    use_cases: ['lifestyle_active', 'brand_anthem'],
    musicgen_prompt:
      'uplifting indie rock rush, bright electric guitars, live drums, melodic bass, feel good anthemic energy, 118 bpm, no vocals',
  },

  // cinematic (3) — hero shots, product reveals, luxury drama
  {
    id: 'cinematic_epic_hero',
    name: 'Epic Hero Reveal',
    mood: 'cinematic',
    sub_moods: ['epic', 'orchestral'],
    tempo_bpm: 90,
    duration_sec: 30,
    instruments: ['orchestra', 'cinematic_drums', 'brass'],
    use_cases: ['hero_shot', 'product_reveal', 'bold_statement'],
    musicgen_prompt:
      'epic orchestral hero cinematic, powerful brass and strings, cinematic drums, trailer style build, heroic atmosphere, 90 bpm, no vocals',
  },
  {
    id: 'cinematic_dramatic_swell',
    name: 'Dramatic Swell',
    mood: 'cinematic',
    sub_moods: ['dramatic', 'emotional'],
    tempo_bpm: 80,
    duration_sec: 30,
    instruments: ['strings', 'piano', 'subtle_percussion'],
    use_cases: ['antes_despues', 'before_after_dramatic'],
    musicgen_prompt:
      'dramatic cinematic swell, emotional strings, contemplative piano, subtle cinematic percussion, tension and release, 80 bpm, no vocals',
  },
  {
    id: 'cinematic_modern_trailer',
    name: 'Modern Trailer',
    mood: 'cinematic',
    sub_moods: ['modern_cinematic', 'hybrid'],
    tempo_bpm: 100,
    duration_sec: 30,
    instruments: ['hybrid_percussion', 'synth_pads', 'orchestra_hits'],
    use_cases: ['launch_announcement', 'premium_reveal'],
    musicgen_prompt:
      'modern hybrid cinematic trailer, hybrid percussion, atmospheric synth pads, orchestra hits, tech brand reveal vibe, 100 bpm, no vocals',
  },

  // ambient (3) — luxury slow, meditation, sophisticated b-roll
  {
    id: 'ambient_chill_flow',
    name: 'Chill Flow',
    mood: 'ambient',
    sub_moods: ['chillhop', 'relaxed'],
    tempo_bpm: 72,
    duration_sec: 30,
    instruments: ['warm_pads', 'chillhop_drums', 'rhodes'],
    use_cases: ['bofu_trust', 'wellness_brand'],
    musicgen_prompt:
      'relaxed chillhop with warm pads, chillhop drums, mellow rhodes piano, coffee shop study vibe, 72 bpm, no vocals',
  },
  {
    id: 'ambient_meditation_space',
    name: 'Meditation Space',
    mood: 'ambient',
    sub_moods: ['meditation', 'spacious'],
    tempo_bpm: 60,
    duration_sec: 30,
    instruments: ['pads', 'field_recordings', 'bowls'],
    use_cases: ['wellness_spa', 'meditation_app'],
    musicgen_prompt:
      'meditation ambient space, spacious reverb pads, subtle field recordings, singing bowls, calm mindful atmosphere, 60 bpm, no vocals',
  },
  {
    id: 'ambient_modern_minimal',
    name: 'Modern Minimal',
    mood: 'ambient',
    sub_moods: ['minimal', 'tech'],
    tempo_bpm: 95,
    duration_sec: 30,
    instruments: ['minimal_synth', 'soft_bass', 'atmospheric_pads'],
    use_cases: ['tech_brand', 'saas_demo'],
    musicgen_prompt:
      'modern minimal ambient tech, minimal synth arpeggios, soft bass, atmospheric pads, clean apple-style product vibe, 95 bpm, no vocals',
  },

  // ugc_authentic (3) — lo-fi hip hop, casual instagram
  {
    id: 'ugc_lofi_hip_hop',
    name: 'Lo-fi Hip Hop UGC',
    mood: 'ugc_authentic',
    sub_moods: ['lofi', 'casual'],
    tempo_bpm: 88,
    duration_sec: 30,
    instruments: ['vinyl_drums', 'jazz_samples', 'bass'],
    use_cases: ['ugc_testimonial', 'reel_casual'],
    musicgen_prompt:
      'casual lofi hip hop, vinyl crackle drums, soft jazz samples, warm bass, gen-z instagram reel vibe, 88 bpm, no vocals',
  },
  {
    id: 'ugc_bedroom_pop',
    name: 'Bedroom Pop',
    mood: 'ugc_authentic',
    sub_moods: ['bedroom_pop', 'indie'],
    tempo_bpm: 95,
    duration_sec: 30,
    instruments: ['clean_guitar', 'simple_drums', 'bass'],
    use_cases: ['gen_z_brand', 'authentic_reel'],
    musicgen_prompt:
      'bedroom pop indie casual, clean electric guitar, simple drum machine, warm bass, gen-z authentic aesthetic, 95 bpm, no vocals',
  },
  {
    id: 'ugc_trap_casual',
    name: 'Casual Trap UGC',
    mood: 'ugc_authentic',
    sub_moods: ['trap', 'urban'],
    tempo_bpm: 80,
    duration_sec: 30,
    instruments: ['808', 'hi_hats', 'melodic_synth'],
    use_cases: ['urban_brand', 'streetwear_ugc'],
    musicgen_prompt:
      'casual trap urban ugc, 808 bass, crisp hi hats, melodic synth lead, modern latinoamerican urban vibe, 80 bpm, no vocals',
  },

  // luxury (3) — slow jazz, minimal sophisticated, premium BOFU
  {
    id: 'luxury_slow_jazz',
    name: 'Slow Jazz Sophistication',
    mood: 'luxury',
    sub_moods: ['jazz', 'sophisticated'],
    tempo_bpm: 70,
    duration_sec: 30,
    instruments: ['upright_bass', 'brushed_drums', 'rhodes'],
    use_cases: ['luxury_brand', 'premium_testimonial'],
    musicgen_prompt:
      'sophisticated slow jazz, upright bass, brushed drums, warm rhodes piano, hotel lobby premium atmosphere, 70 bpm, no vocals',
  },
  {
    id: 'luxury_minimal_elegance',
    name: 'Minimal Elegance',
    mood: 'luxury',
    sub_moods: ['minimal', 'elegant'],
    tempo_bpm: 85,
    duration_sec: 30,
    instruments: ['piano', 'subtle_strings', 'soft_bass'],
    use_cases: ['luxury_product', 'premium_reveal'],
    musicgen_prompt:
      'minimal elegant luxury, refined piano melody, subtle strings, soft walking bass, high end boutique atmosphere, 85 bpm, no vocals',
  },
  {
    id: 'luxury_neo_soul',
    name: 'Neo Soul Premium',
    mood: 'luxury',
    sub_moods: ['neo_soul', 'smooth'],
    tempo_bpm: 82,
    duration_sec: 30,
    instruments: ['rhodes', 'electric_bass', 'smooth_drums'],
    use_cases: ['premium_lifestyle', 'spa_wellness_premium'],
    musicgen_prompt:
      'smooth neo soul luxury, warm rhodes keys, melodic electric bass, smooth pocket drums, sophisticated premium vibe, 82 bpm, no vocals',
  },
];

export const MOOD_LABELS_ES: Record<MusicMood, { label: string; description: string; emoji: string }> = {
  warm: { label: 'Cálido', description: 'Acústico e íntimo. Testimonial, historia de marca.', emoji: '🔥' },
  energetic: { label: 'Energético', description: 'Upbeat y potente. Hooks y CTAs directos.', emoji: '⚡' },
  cinematic: { label: 'Cinematográfico', description: 'Épico y dramático. Hero shots y product reveals.', emoji: '🎬' },
  ambient: { label: 'Ambient', description: 'Relajado y atmosférico. Wellness y B-roll elegante.', emoji: '🌊' },
  ugc_authentic: { label: 'UGC Auténtico', description: 'Casual y Gen-Z. Reels e Instagram orgánico.', emoji: '📱' },
  luxury: { label: 'Luxury', description: 'Sofisticado y premium. Marcas high-end y BOFU trust.', emoji: '✨' },
};

export function getTracksByMood(mood: MusicMood): MusicTrackSeed[] {
  return MUSIC_LIBRARY_SEED.filter((t) => t.mood === mood);
}

export function getTrackById(id: string): MusicTrackSeed | undefined {
  return MUSIC_LIBRARY_SEED.find((t) => t.id === id);
}

export function pickTrackForAngleAndMood(angulo: string, mood: MusicMood): MusicTrackSeed | undefined {
  const pool = getTracksByMood(mood);
  const withUseCase = pool.find((t) => t.use_cases.includes(angulo));
  return withUseCase || pool[0];
}
