# Lynphea Charm Dashboard

> **Estado actual:** la aplicación está conectándose a Supabase para autenticación y persistencia.
> La configuración vigente está en [supabase/README.md](./supabase/README.md). El brief histórico
> de frontend-only que sigue describe el origen del proyecto y no el estado actual.

Quiero que construyas una primera versión MUY BÁSICA de una aplicación web para mi marca de maquillaje LYNPHEA.

IMPORTANTE:

NO construyas backend.

NO uses Supabase.

NO uses Firebase.

NO uses autenticación.

NO uses base de datos.

Por ahora SOLO quiero una aplicación frontend que funcione en local y use localStorage.

NO intentes construir todo el sistema todavía.

PRIORIDAD ABSOLUTA:

Quiero que al terminar este prompt YA EXISTE UNA INTERFAZ VISUAL COMPLETA Y NAVEGABLE que pueda abrir y probar.

==================================================

MARCA

==================================================

Nombre:

LYNPHEA

Subtítulo:

MAKEUP • BEAUTY

La interfaz debe sentirse como una herramienta privada y elegante de una marca de maquillaje.

Estilo:

- Minimalista

- Femenino

- Elegante

- Premium

- Limpio

- Moderno

Colores:

#111111 negro

#FFFFFF blanco

#F5E4EA rosa blush

#D99AAF rosa de acento

#777777 gris

NO quiero un dashboard genérico de empresa.

Quiero mucho espacio blanco, tarjetas limpias, bordes finos y pequeños detalles en rosa.

==================================================

LAYOUT

==================================================

Crear inmediatamente:

SIDEBAR IZQUIERDO en desktop.

Arriba:

LYNPHEA

MAKEUP • BEAUTY

Menú:

Inicio

Ventas

Inventario

Productos

Compras

Clientes

Gastos

Abajo:

Configuración

En móvil, convertir el sidebar en menú compacto.

==================================================

DASHBOARD

==================================================

La página inicial debe ser visualmente atractiva.

Título:

"Hola, LYNPHEA"

Subtítulo:

"Resumen de tu negocio"

Mostrar 5 tarjetas:

VENTAS

$450.000

UTILIDAD

$XXX.XXX

MARGEN

XX%

INVENTARIO

$XXX.XXX

POR COBRAR

$XXX.XXX

Estos datos pueden ser datos DEMO inicialmente.

Debajo mostrar:

"Ventas recientes"

Una tabla con algunas ventas de ejemplo.

Columnas:

Cliente

Producto

Total

Pago

Fecha

Ejemplo:

Claudia Contreras

Kit pestañina + fortalecedora

$25.000

Pagado

Hoy

Erika Tatiana

Labial Eclipse

$15.000

Pagado

Hoy

Alejandra Barranca

Polvos Jack

$30.000

Pendiente

Hoy

Debajo mostrar un gráfico sencillo de:

"Ventas"

con los últimos 7 días.

==================================================

VENTAS

==================================================

Crear una pantalla funcional llamada:

"Ventas"

Arriba:

- Nueva venta

Mostrar tabla:

Fecha

Cliente

Producto

Total

Estado

Acciones

Botón:

"+ Nueva venta"

Al pulsarlo abrir un modal sencillo.

Campos:

Producto

Cantidad

Precio

Cliente

Estado de pago

Estados:

Pagado

Abono

Pendiente

Abonado

Total

Saldo pendiente

El total y saldo deben calcularse automáticamente.

NO crear todavía un sistema complejo de clientes.

==================================================

INVENTARIO

==================================================

Crear una pantalla visual:

"Inventario"

Mostrar tarjetas:

Productos

Unidades

Valor inventario

Productos bajos

Tabla:

SKU

Producto

Línea

Stock

Precio

Estado

Ejemplos:

LYN-DAI-001

Pestañina Fortalecedora

LYNPHEA DAILY

12

$15.000

Disponible

LYN-DAI-002

Labial Eclipse

LYNPHEA DAILY

8

$15.000

Disponible

LYN-PRO-001

Polvos Jack

LYNPHEA PRO

3

$30.000

Bajo

==================================================

PRODUCTOS

==================================================

Crear pantalla:

"Productos"

Botón:

- Nuevo producto

Tabla:

SKU

Producto

Línea

Costo

Precio

Stock

Acciones

Agregar modal para crear producto.

Campos:

SKU

Nombre

Línea

Costo

Precio

Stock inicial

Líneas:

LYNPHEA DAILY

LYNPHEA PRO

==================================================

COMPRAS

==================================================

Crear una pantalla básica:

"Compras"

Botón:

- Registrar compra

Tabla:

Fecha

Proveedor

Productos

Total

Proveedores:

TRENDY

ATENEA

OTRO

==================================================

CLIENTES

==================================================

Crear pantalla:

"Clientes"

Tabla:

Cliente

Compras

Ventas acumuladas

Saldo pendiente

Última compra

Usar algunos clientes demo:

Claudia Contreras

Erika Tatiana

Alejandra Barranca

Dayana Dorada

Tiffany Dorada

==================================================

GASTOS

==================================================

Crear pantalla:

"Gastos"

Botón:

- Nuevo gasto

Tabla:

Fecha

Categoría

Descripción

Valor

Categorías:

Marketing

Empaques

Domicilios

Contenido

Otros

==================================================

FUNCIONALIDAD

==================================================

Aunque esta primera versión sea básica, quiero que:

- Los botones funcionen.

- Se puedan navegar todas las páginas.

- Se puedan abrir y cerrar modales.

- Se puedan crear productos.

- Se puedan registrar ventas.

- Se puedan registrar gastos.

- Los datos se guarden en localStorage.

- Al recargar la página los datos permanezcan.

NO implementar todavía:

- autenticación

- backend

- usuarios

- permisos

- base de datos

- reportes avanzados

- proveedores completos

- sistema contable avanzado

- exportaciones

- importaciones

- gráficos complejos

==================================================

IMPORTANTE

==================================================

NO quiero que gastes tiempo construyendo una arquitectura enorme.

NO quiero que intentes terminar todo el sistema.

Quiero primero:

UNA WEB BONITA

-

NAVEGABLE

-

FUNCIONAL

-

CON DATOS DEMO

-

QUE PUEDA PROBAR INMEDIATAMENTE.

Prioriza la interfaz visual y la experiencia de usuario.

Si tienes que simplificar alguna funcionalidad, simplifícala.

NO elimines páginas.

Todas las páginas del menú deben existir y tener una interfaz visual aunque algunas tengan funcionalidad básica.

Al terminar quiero poder ver inmediatamente el dashboard y navegar por toda la aplicación.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/28b9c379-6b26-4704-a41e-abf7717f539e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
