-- Seed first blog post (idempotent)
-- NOTE: Seed data en migration intencionalmente. Razón: garantizar que el primer
-- post esté disponible inmediatamente post-deploy en todos los ambientes sin
-- requerir paso manual. Posts subsecuentes se crean vía UI admin.
--
-- IMPORTANTE: Esta migración asume que el usuario 'jmbarros@bgconsult.cl' existe
-- en auth.users. Si no existe, la migración hace RAISE NOTICE pero no falla
-- (para no bloquear deploys en ambientes donde ese owner no aplica).

DO $migration$
DECLARE
  v_user_id UUID;
  v_existing_id UUID;
BEGIN
  -- Idempotencia: si ya existe un post con este slug, no hacemos nada.
  SELECT id INTO v_existing_id
    FROM public.blog_posts
    WHERE slug = 'por-que-pymes-dejan-agencia-digital'
    LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE NOTICE 'Seed skipped: post already exists (id=%)', v_existing_id;
    RETURN;
  END IF;

  -- Buscar el owner del seed con orden determinístico (created_at más antiguo).
  SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = 'jmbarros@bgconsult.cl'
    ORDER BY created_at ASC
    LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Seed skipped: user jmbarros@bgconsult.cl not found in this environment';
    RETURN;
  END IF;

  INSERT INTO public.blog_posts (
    user_id,
    title,
    slug,
    excerpt,
    content,
    category,
    published
  ) VALUES (
    v_user_id,
    'Por qué tantas PYMEs chilenas dejan a su agencia digital al año',
    'por-que-pymes-dejan-agencia-digital',
    'La matemática que nadie suma cuando vende un plan PYME: cuánto cuesta, qué retorna y por qué el modelo no fue diseñado para empresas que facturan entre $500K y $6M mensuales.',
    $body$En 2025, **el 78% de los clientes de agencias de marketing tiene previsto revisar formalmente su relación con ella**. Cuatro de cada cinco. Y entre las agencias pequeñas (1 a 10 empleados, el segmento que típicamente atiende a las PYMEs en Chile), **la rotación anual de clientes alcanza el 32%**. En las agencias de PPC puro —las que solo manejan Meta Ads o Google Ads, las más comunes para una PYME chilena— el número sube a **49%**.

Casi la mitad de las pequeñas empresas que contratan una agencia para sus campañas digitales no renuevan al año siguiente.

La pregunta no es si las agencias trabajan bien. Muchas lo hacen. La pregunta es por qué un porcentaje tan alto de PYMEs decide irse.

> La respuesta no es opinión. Es matemática.

## El segmento del que estamos hablando

Antes de los números, definamos a quién le pasa esto.

Según el Servicio de Impuestos Internos, una **pequeña empresa chilena** factura entre 2.401 y 25.000 UF al año (aproximadamente entre **$95 millones y $975 millones de CLP**). Pero dentro de ese rango hay enormes diferencias.

Este artículo se enfoca en un segmento muy concreto: el e-commerce que **vende entre $500.000 y $6.000.000 mensuales** (entre $6M y $72M anuales). Es el tramo más bajo de "pequeña empresa" según el SII —y, en muchos casos, microempresa formal—. Es decir: emprendimientos online reales, con productos, con tráfico, con clientes, pero todavía con margen ajustado y sin equipo de marketing propio.

Es exactamente el segmento al que todas las agencias digitales chilenas le ofrecen sus "planes PYME".

## Lo que cuesta realmente

Una agencia digital pequeña en Chile cobra hoy estos rangos por la **gestión** (sin contar la inversión publicitaria):

| Plan tipo | Fee mensual de gestión |
|---|---|
| Plan PYME Starter | **$390.000** |
| Plan PYME Growth | **$590.000** |
| Plan PYME Pro | **$890.000** |

Estos precios son consistentes con la oferta pública de varias agencias chilenas en 2025. El rango general del mercado va de **$300.000 a $1.900.000** mensuales para agencias profesionales, y el fee NO incluye lo que la PYME paga directamente a Meta o Google por las campañas.

A eso hay que sumar la inversión publicitaria. La recomendación más común de las propias agencias es de **$800.000 a $3.000.000 mensuales** en ad spend para que las plataformas tengan datos suficientes para optimizar.

> **Costo total mínimo:** $390.000 (gestión) + $800.000 (publicidad) = **$1.190.000 mensuales** para arrancar el plan más básico con la inversión mínima recomendada.

## La matemática del segmento

Ahora cruzamos ese costo con el revenue mensual del segmento, asumiendo un margen bruto típico del e-commerce chileno de **25%** (después de costo de producto y logística básica, antes de sueldos y gastos fijos):

| Venta mensual | Margen bruto (25%) | Costo agencia + ads | Resultado |
|---|---|---|---|
| $500.000 | $125.000 | $1.190.000 | **−$1.065.000** |
| $1.000.000 | $250.000 | $1.190.000 | **−$940.000** |
| $3.000.000 | $750.000 | $1.190.000 | **−$440.000** |
| $6.000.000 | $1.500.000 | $1.190.000 | **+$310.000** |

El número solo se vuelve positivo cuando la PYME está vendiendo cerca de **$6 millones mensuales**. Y aún así, los $310.000 sobrantes deben cubrir sueldos, arriendo, contabilidad, herramientas, devoluciones y todo lo demás.

Para que el modelo funcione en los tramos inferiores ($500K a $3M), la agencia necesitaría generar un **retorno sobre la inversión publicitaria (ROAS) excepcional** que compense el fee fijo.

¿Cuál es el ROAS que efectivamente entregan las plataformas?

## El benchmark global (no la promesa, el dato)

El **ROAS promedio de Meta Ads en 2025 cerró en 2,19:1** considerando todas las industrias. Es decir: por cada peso invertido en publicidad, retornan 2,19 pesos en ventas atribuidas. En e-commerce general, el promedio cayó a **2,87** este año.

Para campañas de **prospección** (audiencias frías, que es donde una PYME crece): **2,19:1**.
Para campañas de **retargeting** (audiencias tibias, que requieren tener tráfico previo): **3,61:1**.

Y un dato crítico: el **CPM de Meta subió 19,2% en el primer trimestre de 2025**, a US$10,88. La publicidad digital se está encareciendo, no abaratando.

Apliquemos esto al caso real de una PYME chilena que vende $1.000.000 al mes y contrata el plan más básico:

- Inversión mensual total: $1.190.000 ($390K agencia + $800K ads).
- ROAS de prospección esperado (2,19): los $800.000 en ads generarían **$1.752.000** en ventas atribuibles.
- Margen bruto sobre eso (25%): **$438.000**.
- Menos fee de agencia ($390.000): **$48.000 de utilidad bruta atribuible al esfuerzo de marketing**.

> $48.000 mensuales de aporte real, antes de sueldos del dueño, gastos fijos y todo lo demás. Y eso asumiendo que las campañas funcionan al promedio.

Si están bajo el promedio durante los primeros 3 meses (el período de aprendizaje normal de cualquier cuenta nueva), el resultado es directamente negativo.

## NPS y retención: lo que mide la industria

El NPS promedio de las **agencias de marketing digital a nivel global es 51 en 2025**. Es un número positivo, pero está lejos del rango "excelente" (70+) que tienen los productos de software más queridos. Significa que la mayoría de los clientes está conforme, pero no encantado.

Cuando vamos al detalle por estructura, la foto cambia:

| Tipo de agencia | Churn anual |
|---|---|
| Retainer (fee mensual fijo) | 18% |
| Híbrida | 28% |
| Pequeñas (1-10 empleados) | **32%** |
| Por proyectos | 42% |
| PPC puro (Meta + Google ads) | **49%** |
| **Top performers globales** | **menos de 5%** |

Las agencias top performers del mundo mantienen menos de 5% de churn anual. La media del segmento que atiende a PYMEs está entre 6 y 10 veces por encima de eso.

Y hay un dato más, casi clínico: **el peak de churn está en los primeros 90 días**. Las agencias retainer pierden el 8% de sus clientes en los primeros 6 meses. Es decir, muchos clientes se van *antes* de que la cuenta termine su curva de aprendizaje. Pagaron el setup, pagaron 3-6 meses de fee, y se fueron sin haber visto resultados sostenidos.

## Por qué falla (no es la agencia, es el modelo)

El problema no es la calidad humana ni profesional de las agencias chilenas. Hay agencias chiquitas en Chile excelentes. El problema es que **el modelo no fue diseñado para este segmento de cliente**.

### 1. El fee fijo no escala con el budget

Una agencia que cobra $390.000 al mes no puede dedicar más de unas pocas horas semanales a esa cuenta. Si lo hiciera, perdería plata. La realidad operacional es que un account manager junior maneja entre 8 y 15 cuentas en paralelo. Cada cuenta recibe atención superficial.

### 2. La curva de aprendizaje toma 3-6 meses

Toda cuenta nueva necesita al menos 3 meses para que las plataformas optimicen, los pixels acumulen data y la agencia entienda el negocio. Eso significa que el 25-50% del primer año se va en setup. El primer año casi nunca rinde.

### 3. El incentivo es estructural, no malicioso

Una agencia tradicional cobra por horas o por fee fijo. Mientras más automatice, menos cobra. El incentivo es a NO automatizar lo automatizable. Para una PYME con margen ajustado, eso es plata que se queda en la mesa.

### 4. La data se queda con la agencia, no con el cliente

Los reportes, los dashboards, los pixels, los aprendizajes acumulados de campañas anteriores: todo eso suele estar en herramientas de la agencia. Cuando la PYME cambia, parte de cero.

### 5. La proporción no calza

Cuando el costo de la agencia equivale a entre el **6,5% y el 178%** del revenue mensual del cliente, hay una desproporción estructural. Las agencias se diseñaron para clientes con budgets de marketing que sean el 5% o menos de su facturación. Una PYME que vende $1M no puede pagar $390K de fee y que ese 39% se justifique con una optimización marginal.

## El costo del fracaso (lo que nadie suma)

Cuando esto no funciona, lo que pasa después es predecible:

1. La PYME aguanta 6-12 meses esperando que mejore.
2. Cambia de agencia. La nueva pide otros 3 meses para "entender el negocio". Reset.
3. Después de la segunda agencia, el dueño decide "hacerlo in-house" sin tener equipo ni experiencia.
4. Las campañas mueren o quedan en piloto automático mal configurado.
5. Los pixels y el tracking se rompen. La data histórica se pierde.
6. El presupuesto que se podría haber invertido en producto, stock o un community manager se quemó en setup repetido.

Es un ciclo que se repite en miles de PYMEs cada año.

## Qué necesita realmente este segmento

No es una mejor agencia. Es un **modelo distinto**.

Lo que tiene sentido económico para una PYME que vende $500K–$6M al mes:

- **Software propio** que ejecute las tareas repetitivas (creación de campañas, segmentación, A/B testing, reportes) en vez de horas humanas.
- **Costo escalable según uso**, no fee fijo. Si un mes vendes menos, pagas menos.
- **Data que se queda con el cliente.** Pixels, listas, históricos: tuyos, no de un tercero.
- **Cero curva de aprendizaje de 3 meses.** Lo que tarde la PYME en cargar productos y conectar Shopify, no más.
- **Decisiones automatizadas con datos, no con reuniones semanales.** El reporte vive disponible 24/7, no llega los lunes.
- **Asesoría humana puntual, cuando se necesita.** No fee mensual obligatorio.

Esto no es ciencia ficción. Es la dirección a la que está yendo el marketing digital en e-commerce a nivel global desde hace 5 años. Lo que pasa es que el mercado chileno todavía está dominado por el modelo tradicional.

---

### Fuentes consultadas (abril 2026)

- Focus Digital — Average Marketing Agency Churn Report 2026
- Predictable Profits — Agency Growth Benchmark 2025
- Survicate / Retently — NPS Industry Benchmarks 2025
- ANA & 4As — Client-Agency Relationship Tenure Report 2025
- Triple Whale — Facebook Ad Benchmarks by Industry 2025
- Focus Digital — Facebook Ads Average ROAS Report 2025
- Upcounting — Average Ecommerce ROAS 2025
- Muller y Pérez — Precios Agencia Marketing Digital Chile 2025
- Lagencia.cl — ¿Cuánto cobra una agencia de marketing digital en Chile 2025?
- Servicio de Impuestos Internos (SII) — Estadísticas de empresas por tamaño según ventas
- Banco Central de Chile / Statista — E-commerce Chile 2010-2024$body$,
    'Performance Marketing',
    true
  );

  RAISE NOTICE 'Seed inserted: post por-que-pymes-dejan-agencia-digital';
END
$migration$;
