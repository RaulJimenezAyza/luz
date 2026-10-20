# Diseño: contrato de dirección

Notas para quien toque la web (no se publica). Hecho siguiendo Impeccable (modo *Operate*, construcción
guiada por código) y la lista de comprobación de UI/UX Pro Max.

**TESIS.** Cada hora del día lleva una letra de la A a la G, como la etiqueta energética europea que todo
el mundo conoce de los electrodomésticos. Se rechaza el panel por defecto de la categoría (fondo oscuro, número
gigante, tarjetas iguales con icono).

**MUNDO PROPIO.** Fondo blanco y tinta casi negra; los siete colores oficiales de la etiqueta
(A `#009640`, B `#52ae32`, C `#c8d300`, D `#ffed00`, E `#fbba00`, F `#eb690b`, G `#e2001a`) hacen el trabajo
de los datos y solo ese. Flechas con punta, marco negro de esquinas redondeadas, flecha negra que señala la
clase. Tipografía Archivo (variable, servida desde el proyecto): ancha y negra para las letras, normal para el texto.

**HISTORIA.** El visitante entiende en un segundo si ahora es caro (la letra), cuándo será barato y a qué
hora poner cada aparato, y cuánto ahorra.

**PRIMERA PANTALLA.** Izquierda: la etiqueta de hoy (escala A–G; en cada fila, las horas que tienen esa
letra; flecha negra con la letra de ahora). Derecha: la frase ("Ahora la luz está cara"), el precio en la
frase y la próxima hora A/B con su cuenta atrás. Debajo, el día hora a hora con la letra de cada columna.

**FORMA.** Escala de etiqueta energética como gesto propio; controles estándar (pestañas, deslizadores,
tabla). Momento de movimiento: las flechas crecen escalonadas al cargar y la flecha negra entra en su fila.

**Letras.** Lineales por precio entre el mínimo y el máximo del día (no por posición): dos horas con casi el
mismo precio tienen la misma letra y un pico aislado es G él solo. A–B = barata, C–E = normal, F–G = cara.
