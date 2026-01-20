import { motion } from 'framer-motion';
import { Mail, Phone, MapPin } from 'lucide-react';

export function ContactSection() {
  return (
    <section id="contacto" className="py-24 relative">
      <div className="container px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-xs uppercase tracking-super-wide text-primary mb-4">Hablemos</p>
          <h2 className="text-3xl md:text-5xl font-light mb-4">
            <span className="text-primary font-medium">Contáctanos</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-light">
            Estamos listos para ayudarte a alcanzar tus objetivos
          </p>
        </motion.div>

        <div className="max-w-2xl mx-auto">
          <div className="grid gap-4">
            {[
              { icon: Mail, label: 'Email', value: 'contacto@consultoriabg.com' },
              { icon: Phone, label: 'Teléfono', value: '+34 XXX XXX XXX' },
              { icon: MapPin, label: 'Ubicación', value: 'España' },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-4 p-6 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg border-2 border-primary/30 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{item.label}</p>
                  <p className="font-medium text-foreground">{item.value}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
