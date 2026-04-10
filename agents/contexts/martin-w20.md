# Martín W20 — Contexto Operacional
## Landing & Conversión

---

## Páginas que posees
| Archivo | Ruta | Descripción |
|---------|------|-------------|
| `src/pages/Index.tsx` | `/` | Landing hub — 4 áreas (Steve, Servicios, Centro Estudios, Blog) |
| `src/pages/Steve.tsx` | `/steve` | Landing de producto — showcase completo |

## Componentes landing/ (5)
| Archivo | Qué hace |
|---------|----------|
| `src/components/landing/Navbar.tsx` | Nav principal con links a Steve, Servicios, Centro Estudios, Blog |
| `src/components/landing/HeroSection.tsx` | Hero con 4 cards de navegación |
| `src/components/landing/ServicesSection.tsx` | Form multi-step (E-commerce/Leads → plataforma → desafíos → gracias) |
| `src/components/landing/ContactSection.tsx` | Cards de contacto (email, teléfono, ubicación) |
| `src/components/landing/Footer.tsx` | Footer con links de políticas |

## Componentes steve-landing/ (15)
| Archivo | Qué hace |
|---------|----------|
| `src/components/steve-landing/SteveNavbar.tsx` | Nav de la landing de producto |
| `src/components/steve-landing/SteveHero.tsx` | Hero — HubSpot booking + WhatsApp CTA + features chips |
| `src/components/steve-landing/LogoBar.tsx` | Marquee animado de logos partners (Meta, Google, etc.) |
| `src/components/steve-landing/ProductShowcase.tsx` | Video/demo con glow effects |
| `src/components/steve-landing/FeatureBento.tsx` | Grid de features (campañas, copy, competencia, analytics) |
| `src/components/steve-landing/HowItWorks.tsx` | 4 pasos de onboarding visual |
| `src/components/steve-landing/StatsSection.tsx` | Métricas clave / social proof |
| `src/components/steve-landing/StevePersonality.tsx` | Sección de personalidad de marca |
| `src/components/steve-landing/PricingSection.tsx` | Tiers de pricing |
| `src/components/steve-landing/FinalCTA.tsx` | CTA de cierre |
| `src/components/steve-landing/ClientLogosSection.tsx` | Logos de clientes + case studies |
| `src/components/steve-landing/TestimonialsSection.tsx` | Testimonios de clientes |
| `src/components/steve-landing/SteveFooter.tsx` | Footer de la landing de producto |
| `src/components/steve-landing/FloatingWhatsAppButton.tsx` | Botón WhatsApp sticky bottom-right |
| `src/components/steve-landing/WaitlistModal.tsx` | Modal de signup para waitlist |

## Endpoint público
| Archivo | Ruta API | Auth | Descripción |
|---------|----------|------|-------------|
| `cloud-run-api/src/routes/public/audit-store.ts` | `POST /api/audit-store` | Ninguna | Auditoría AI de tienda (Apify + Haiku) |

## Mockups de referencia
| Archivo | Descripción |
|---------|-------------|
| `mockup-landing-v2.html` | Diseño completo (1,712 líneas) — dark theme, gradients, design tokens |
| `public/audit-report.html` | Mockup de reporte de auditoría |

## Tablas propias
Ninguna — Martín no tiene tablas propias. El audit-store es stateless (no persiste resultados).

## Crons propios
Ninguno.

## Dependencias de otros agentes
| Agente | Qué necesitas de él |
|--------|---------------------|
| Catalina (Marketing) | Copy y messaging — tono anti-agencia, beneficios traducidos a $ |
| Camila W4 (Frontend) | Design system compartido (shadcn/ui, Tailwind tokens) |
| Tomás W7 (AI) | audit-store usa Anthropic API (Haiku) |
| Sebastián W5 (Cloud) | audit-store corre en Cloud Run (steve-api) |
| Paula W19 (WhatsApp) | FloatingWhatsAppButton → número de WhatsApp de Steve |

## Links externos en la landing
| Destino | URL | Componente |
|---------|-----|------------|
| HubSpot Meeting | `https://meetings.hubspot.com/jose-manuel15` | SteveHero.tsx |
| WhatsApp Steve | `https://wa.me/15559061514?text=...` | FloatingWhatsAppButton.tsx, SteveHero.tsx |
| Auth/Login | `/auth` | SteveNavbar.tsx |

## Design tokens (del mockup)
```
Background: #0F172A (dark navy)
Primary: #1E3A7B (navy blue)
Accent: #38BDF8 (cyan)
WhatsApp: #25D366
Text gradient: blue-to-cyan
Navbar: fixed, transparent → blur glass on scroll
```

## Issues conocidos
1. **audit-store sin UI** — endpoint funciona pero no hay componente React que lo consuma
2. **ServicesSection form sin backend** — captura datos pero no los envía a ningún endpoint
3. **Sin SEO** — no hay meta tags, Open Graph, sitemap ni robots.txt
4. **Sin analytics** — no hay tracking de conversión (pendiente decisión de JM)
