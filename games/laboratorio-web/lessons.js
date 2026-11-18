// Equivalent starting points let students revisit a practice independently.
const entry = '<article><h2>Radar</h2><p>Medimos distancias con ultrasonido.</p></article>';
const entries = entry + '\n<article><h2>Rover</h2><p>Exploramos con dos motores.</p></article>';
const header = '<header><h1>Feria de robótica</h1></header>';
const grid = header + '\n<main class="proyectos">\n' + entries + '\n</main>';
const button = '<button id="programa" type="button">Ver horario</button>\n<p id="horario" hidden>La feria empieza a las 9.</p>';
const base = 'body { font: 16px/1.5 system-ui; margin: 20px; color: #143b31; }\narticle { background: #edf6ee; border: 1px solid #bbd4c4; padding: 12px; }\n';
const columns = '.proyectos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }\n';
export const lessons = [
  {id:'estructura',name:'Estructura HTML',title:'Presenta tu feria',goal:'Construye una página que permita reconocer el título del evento y sus proyectos aunque se lea sin estilos.',
   steps:['En HTML, pon el título de la feria en un h1 dentro de header.','Dentro de main, crea dos article. Cada uno necesita un h2 con el nombre del proyecto y un párrafo que explique qué hace.','Pulsa Ver resultado. Después comprueba si el navegador reconoce las partes de tu página.'],
   sample:"<article>\n  <h2>Huerta automática</h2>\n  <p>Un sensor mide la humedad de la tierra.</p>\n</article>",
   hint:'header y main son regiones distintas. Cada article agrupa su propio título y descripción.', html:'<header>Feria de robótica</header>\n<main>\n  <!-- Presenta aquí tus dos proyectos -->\n</main>',css:base,js:''},
  {id:'rejilla',name:'Diseño con CSS',title:'Ordena los proyectos',goal:'Convierte dos artículos apilados en una galería de dos columnas con espacio entre ellos.',
   steps:['Observa que el elemento main tiene la clase proyectos. Abre CSS.','Aplica display: grid a .proyectos. Define dos columnas y deja al menos 8 px de separación horizontal.','Comprueba que los dos proyectos quedan a la misma altura y se leen por separado.'],
   sample:".muestras {\n  display: grid;\n  grid-template-columns: 2fr 1fr;\n  gap: 16px;\n}",
   hint:'Dos unidades fr del mismo tamaño reparten el espacio disponible por igual.',html:grid,css:base,js:'',file:'css'},
  {id:'adaptable',name:'Diseño adaptable',title:'Una feria para el celular',goal:'Conserva la galería de escritorio y convierte las tarjetas en una sola columna en una pantalla pequeña.',
   steps:['Compara la vista a 640 px con la de 360 px usando Pantalla de prueba.','Añade una regla @media en CSS. A 360 px los artículos deben quedar uno debajo del otro; a 640 px deben compartir fila.','Pulsa Comprobar reto. El laboratorio medirá la posición y el desbordamiento en ambos tamaños.'],
   sample:"@media (max-width: 500px) {\n  .cartel { font-size: 18px; }\n}",
   hint:'Dentro de @media (max-width: 500px) puedes redefinir grid-template-columns para .proyectos.',html:grid,css:base+columns,js:'',file:'css'},
  {id:'eventos',name:'Eventos y DOM',title:'Revela el horario',goal:'Programa un botón que muestre y vuelva a ocultar el horario de la feria.',
   steps:['En HTML identifica el botón programa y el párrafo horario. El atributo hidden oculta el párrafo.','En JavaScript, busca ambos elementos con document.querySelector y escucha el evento click del botón.','Cambia el valor de hidden con cada clic. Prueba el botón dos veces antes de comprobar.'],
   sample:"const aviso = document.querySelector('#aviso');\naviso.addEventListener('click', () => {\n  aviso.textContent = 'Mensaje recibido';\n});",
   hint:'elemento.hidden es un booleano. El operador ! invierte su valor actual.',html:header+'\n'+button,css:base,js:'// Conecta el botón con el horario.\n',file:'js'},
  {id:'publicacion',name:'Proyecto y publicación',title:'Prepara tu página para compartir',goal:'Integra la feria, comprueba su estructura, su diseño y su interacción, y llévate un index.html independiente.',
   steps:['En HTML añade el segundo proyecto. En CSS configura la galería para escritorio y móvil como en las prácticas anteriores.','Conecta el botón al horario. Comprueba el reto para revisar los cuatro aspectos juntos.','Descarga tu página y abre index.html en otro navegador. Para publicarla, sirve ese archivo en un alojamiento estático que controles, por ejemplo en un sitio de Netlify. El enlace público se obtiene en el alojamiento.'],
   sample:"mi-feria/\n  index.html",
   hint:'Vuelve a las prácticas anteriores para consultar tus borradores. Al descargar se reúnen HTML, estilos y JavaScript en un archivo.',html:header+'\n<main class="proyectos">\n'+entry+'\n</main>\n'+button,css:base,js:''}
];
