# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - generic [ref=e4]:
    - link "Volver" [ref=e6] [cursor=pointer]:
      - /url: /
      - img [ref=e7]
      - text: Volver
    - generic [ref=e9]:
      - img "Steve Ads" [ref=e11]
      - heading "Acceder al Panel" [level=1] [ref=e12]
      - paragraph [ref=e13]: Ingresa tus credenciales
      - generic [ref=e14]:
        - generic [ref=e15]:
          - text: Email
          - generic [ref=e16]:
            - img [ref=e17]
            - textbox "Email" [ref=e20]:
              - /placeholder: tu@email.com
              - text: jmbarros@bgconsult.cl
        - generic [ref=e21]:
          - text: Contraseña
          - generic [ref=e22]:
            - img [ref=e23]
            - textbox "Contraseña" [active] [ref=e26]:
              - /placeholder: ••••••••
        - button "¿Olvidaste tu contraseña?" [ref=e28] [cursor=pointer]
        - button "Iniciar Sesión" [ref=e29] [cursor=pointer]
      - generic [ref=e34]: O continúa con
      - button "Continuar con Google" [ref=e35] [cursor=pointer]:
        - img
        - text: Continuar con Google
      - button "¿No tienes cuenta? Regístrate" [ref=e37] [cursor=pointer]
```