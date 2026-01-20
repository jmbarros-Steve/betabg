import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  ShoppingCart, Users, PieChart, Bot, Target, 
  CheckCircle2, ArrowRight, ArrowLeft, Send, ArrowUpLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import logoKlaviyo from '@/assets/logo-klaviyo-clean.png';
import logoMeta from '@/assets/logo-meta-clean.png';
import logoShopify from '@/assets/logo-shopify-clean.png';
import logo from '@/assets/logo.jpg';

// Google Ads Logo
const GoogleAdsLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
    <path d="M3.3 21.7c1.8 1.1 4.2.5 5.3-1.3L17.8 5.6c1.1-1.8.5-4.2-1.3-5.3-1.8-1.1-4.2-.5-5.3 1.3L2 16.4c-1.1 1.8-.5 4.2 1.3 5.3z" fill="#FBBC04"/>
    <path d="M20.7 21.7c-1.8 1.1-4.2.5-5.3-1.3L6.2 5.6c-1.1-1.8-.5-4.2 1.3-5.3 1.8-1.1 4.2-.5 5.3 1.3l9.2 14.8c1.1 1.8.5 4.2-1.3 5.3z" fill="#4285F4"/>
    <circle cx="6" cy="18" r="3.5" fill="#34A853"/>
  </svg>
);

const officialPartners = [
  { name: 'Meta', logo: logoMeta },
  { name: 'Google', logo: 'google' },
  { name: 'Klaviyo', logo: logoKlaviyo },
  { name: 'Shopify', logo: logoShopify },
];

const ecommerceTools = ['Shopify', 'WooCommerce', 'Jumpseller'];
const leadTools = ['Lusha', 'LinkedIn Ads', 'Waalaxy', 'Apollo', 'Bots IA'];
const financeTools = ['Clay', 'Chipax', 'BSALE'];

const stats = [
  { value: '5+', label: 'Años de experiencia' },
  { value: '50+', label: 'Proyectos completados' },
  { value: '100%', label: 'Clientes satisfechos' },
  { value: '24/7', label: 'Soporte disponible' },
];

const revenueRanges = [
  'Menos de $5,000 USD/mes',
  '$5,000 - $20,000 USD/mes',
  '$20,000 - $50,000 USD/mes',
  '$50,000 - $100,000 USD/mes',
  'Más de $100,000 USD/mes',
];

const leadRanges = [
  'Menos de 100 leads/mes',
  '100 - 500 leads/mes',
  '500 - 2,000 leads/mes',
  '2,000 - 10,000 leads/mes',
  'Más de 10,000 leads/mes',
];

type FormStep = 'initial' | 'ecommerce' | 'leads' | 'challenges' | 'thanks';

interface FormData {
  need: 'ecommerce' | 'leads' | null;
  platform: string;
  currentLeads: string;
  revenue: string;
  challenges: string;
}

const ServiciosCorporativos = () => {
  const [formStep, setFormStep] = useState<FormStep>('initial');
  const [formData, setFormData] = useState<FormData>({
    need: null,
    platform: '',
    currentLeads: '',
    revenue: '',
    challenges: '',
  });

  const handleNeedSelect = (need: 'ecommerce' | 'leads') => {
    setFormData({ ...formData, need });
    setFormStep(need === 'ecommerce' ? 'ecommerce' : 'leads');
  };

  const handleNext = () => {
    if (formStep === 'ecommerce' || formStep === 'leads') {
      setFormStep('challenges');
    } else if (formStep === 'challenges') {
      setFormStep('thanks');
    }
  };

  const handleBack = () => {
    if (formStep === 'ecommerce' || formStep === 'leads') {
      setFormStep('initial');
    } else if (formStep === 'challenges') {
      setFormStep(formData.need === 'ecommerce' ? 'ecommerce' : 'leads');
    }
  };

  const resetForm = () => {
    setFormStep('initial');
    setFormData({
      need: null,
      platform: '',
      currentLeads: '',
      revenue: '',
      challenges: '',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border"
      >
        <div className="container px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="Consultoría BG" className="h-12 w-auto" />
          </Link>

          <Link to="/">
            <Button variant="outline" size="sm" className="uppercase tracking-wider text-xs">
              <ArrowUpLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>
          </Link>
        </div>
      </motion.nav>

      <section className="py-24 pt-32 relative bg-card">
        <div className="container px-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <p className="text-xs uppercase tracking-super-wide text-primary mb-4">Lo que hacemos</p>
            <h1 className="text-3xl md:text-5xl font-light mb-4">
              Consultoría de <span className="text-primary font-medium">Escalamiento</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-light">
              Soluciones integrales para hacer crecer tu negocio de forma sostenible y rentable
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto mb-16"
          >
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl md:text-4xl font-light text-primary mb-1">{stat.value}</div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          {/* Official Partners */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-16"
          >
            <div className="text-center mb-8">
              <Badge variant="secondary" className="mb-4">Partners Oficiales</Badge>
              <h3 className="text-xl font-medium">Certificados por las mejores plataformas</h3>
            </div>
            <div className="flex flex-wrap justify-center items-center gap-8">
              {officialPartners.map((partner, index) => (
                <div key={index} className="flex items-center gap-3 px-6 py-3 bg-background rounded-lg border">
                  <div className="w-10 h-10 flex items-center justify-center">
                    {partner.logo === 'google' ? (
                      <GoogleAdsLogo />
                    ) : (
                      <img src={partner.logo} alt={partner.name} className="w-8 h-8 object-contain" />
                    )}
                  </div>
                  <span className="font-medium">{partner.name}</span>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                </div>
              ))}
            </div>
          </motion.div>

          {/* Tools Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="grid md:grid-cols-3 gap-6 mb-16"
          >
            {/* E-Commerce */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-emerald-600" />
                </div>
                <h4 className="font-semibold">E-Commerce</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {ecommerceTools.map((tool) => (
                  <Badge key={tool} variant="outline">{tool}</Badge>
                ))}
              </div>
            </Card>

            {/* Lead Management */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <h4 className="font-semibold">Gestión de Leads</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {leadTools.map((tool) => (
                  <Badge key={tool} variant="outline" className={tool === 'Bots IA' ? 'bg-primary/10 border-primary' : ''}>
                    {tool === 'Bots IA' && <Bot className="w-3 h-3 mr-1" />}
                    {tool}
                  </Badge>
                ))}
              </div>
            </Card>

            {/* Financial Strategies */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <PieChart className="w-5 h-5 text-amber-600" />
                </div>
                <h4 className="font-semibold">Estrategias Financieras</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {financeTools.map((tool) => (
                  <Badge key={tool} variant="outline">{tool}</Badge>
                ))}
              </div>
            </Card>
          </motion.div>

          {/* Interactive Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="max-w-2xl mx-auto overflow-hidden">
              <div className="bg-primary/5 p-6 border-b">
                <h3 className="text-xl font-semibold text-center flex items-center justify-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  ¿Cómo podemos ayudarte?
                </h3>
              </div>
              <CardContent className="p-6">
                <AnimatePresence mode="wait">
                  {/* Step 1: Initial */}
                  {formStep === 'initial' && (
                    <motion.div
                      key="initial"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <Label className="text-lg font-medium">¿Qué necesitas?</Label>
                      <div className="grid md:grid-cols-2 gap-4">
                        <button
                          onClick={() => handleNeedSelect('ecommerce')}
                          className="p-6 rounded-lg border-2 hover:border-primary transition-colors text-left group"
                        >
                          <ShoppingCart className="w-8 h-8 text-emerald-600 mb-3" />
                          <h4 className="font-semibold mb-1">E-Commerce</h4>
                          <p className="text-sm text-muted-foreground">Escalar mi tienda online</p>
                        </button>
                        <button
                          onClick={() => handleNeedSelect('leads')}
                          className="p-6 rounded-lg border-2 hover:border-primary transition-colors text-left group"
                        >
                          <Users className="w-8 h-8 text-blue-600 mb-3" />
                          <h4 className="font-semibold mb-1">Escalar en Leads</h4>
                          <p className="text-sm text-muted-foreground">Conseguir más prospectos</p>
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: E-Commerce */}
                  {formStep === 'ecommerce' && (
                    <motion.div
                      key="ecommerce"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="space-y-4">
                        <Label className="text-base font-medium">¿Qué plataforma usas?</Label>
                        <RadioGroup
                          value={formData.platform}
                          onValueChange={(v) => setFormData({ ...formData, platform: v })}
                          className="grid grid-cols-2 gap-3"
                        >
                          {['Shopify', 'WooCommerce', 'Jumpseller', 'Otra'].map((platform) => (
                            <div key={platform} className="flex items-center space-x-2">
                              <RadioGroupItem value={platform} id={platform} />
                              <Label htmlFor={platform} className="cursor-pointer">{platform}</Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-base font-medium">¿Cuánto facturas mensualmente?</Label>
                        <RadioGroup
                          value={formData.revenue}
                          onValueChange={(v) => setFormData({ ...formData, revenue: v })}
                          className="space-y-2"
                        >
                          {revenueRanges.map((range) => (
                            <div key={range} className="flex items-center space-x-2">
                              <RadioGroupItem value={range} id={`rev-${range}`} />
                              <Label htmlFor={`rev-${range}`} className="cursor-pointer">{range}</Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      <div className="flex gap-3">
                        <Button variant="outline" onClick={handleBack}>
                          <ArrowLeft className="w-4 h-4 mr-2" />
                          Atrás
                        </Button>
                        <Button onClick={handleNext} disabled={!formData.platform || !formData.revenue} className="flex-1">
                          Siguiente
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: Leads */}
                  {formStep === 'leads' && (
                    <motion.div
                      key="leads"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="space-y-4">
                        <Label className="text-base font-medium">¿Cuántos leads generas actualmente?</Label>
                        <RadioGroup
                          value={formData.currentLeads}
                          onValueChange={(v) => setFormData({ ...formData, currentLeads: v })}
                          className="space-y-2"
                        >
                          {leadRanges.map((range) => (
                            <div key={range} className="flex items-center space-x-2">
                              <RadioGroupItem value={range} id={`leads-${range}`} />
                              <Label htmlFor={`leads-${range}`} className="cursor-pointer">{range}</Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-base font-medium">¿Cuánto facturas mensualmente?</Label>
                        <RadioGroup
                          value={formData.revenue}
                          onValueChange={(v) => setFormData({ ...formData, revenue: v })}
                          className="space-y-2"
                        >
                          {revenueRanges.map((range) => (
                            <div key={range} className="flex items-center space-x-2">
                              <RadioGroupItem value={range} id={`rev2-${range}`} />
                              <Label htmlFor={`rev2-${range}`} className="cursor-pointer">{range}</Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      <div className="flex gap-3">
                        <Button variant="outline" onClick={handleBack}>
                          <ArrowLeft className="w-4 h-4 mr-2" />
                          Atrás
                        </Button>
                        <Button onClick={handleNext} disabled={!formData.currentLeads || !formData.revenue} className="flex-1">
                          Siguiente
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: Challenges */}
                  {formStep === 'challenges' && (
                    <motion.div
                      key="challenges"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="space-y-4">
                        <Label className="text-base font-medium">
                          ¿Qué desafíos tienes hoy, aparte de conseguir más clientes?
                        </Label>
                        <Textarea
                          placeholder="Cuéntanos sobre tus retos actuales: operaciones, equipo, tecnología, finanzas..."
                          value={formData.challenges}
                          onChange={(e) => setFormData({ ...formData, challenges: e.target.value })}
                          rows={4}
                        />
                      </div>

                      <div className="flex gap-3">
                        <Button variant="outline" onClick={handleBack}>
                          <ArrowLeft className="w-4 h-4 mr-2" />
                          Atrás
                        </Button>
                        <Button onClick={handleNext} disabled={!formData.challenges.trim()} className="flex-1">
                          <Send className="w-4 h-4 mr-2" />
                          Enviar
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 4: Thanks */}
                  {formStep === 'thanks' && (
                    <motion.div
                      key="thanks"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-8 space-y-4"
                    >
                      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-8 h-8 text-green-600" />
                      </div>
                      <h4 className="text-xl font-semibold">¡Gracias por contactarnos!</h4>
                      <p className="text-muted-foreground">
                        Hemos recibido tu información. Nuestro equipo se pondrá en contacto contigo
                        en las próximas 24 horas para agendar una reunión.
                      </p>
                      <Button variant="outline" onClick={resetForm}>
                        Enviar otra consulta
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default ServiciosCorporativos;
