/* =====================================================================
   LEM537 — Primera Evaluación Parcial
   Lógica de la aplicación: registro, render de reactivos, autoguardado,
   registro de integridad y disparo de la generación del PDF.
   ===================================================================== */
(function () {
  'use strict';

  var B = window.LEM537_BANCO;
  var V = window.LEM537_VAR;

  // ------------------------------------------------------------------ util
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }

  /* Decodifica base64 con contenido UTF-8. */
  function b64d(s) {
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  /* Normaliza texto para comparación de canarios: minúsculas, sin acentos ni
     signos, espacios colapsados. */
  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function dosDig(n) { return (n < 10 ? '0' : '') + n; }

  function hhmmss(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return dosDig(Math.floor(s / 3600)) + ':' + dosDig(Math.floor(s / 60) % 60) + ':' + dosDig(s % 60);
  }

  function fechaLarga(d) {
    var meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
      'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear() +
      ', ' + dosDig(d.getHours()) + ':' + dosDig(d.getMinutes()) + ':' + dosDig(d.getSeconds());
  }

  /* Huella determinista del documento (folio de verificación). */
  function folio(txt) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < txt.length; i++) {
      h1 ^= txt.charCodeAt(i); h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = (Math.imul(h2 ^ txt.charCodeAt(i), 0x85ebca6b)) >>> 0;
    }
    var s = (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
    return (s + '00000000000000').slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
  }

  // ---------------------------------------------------------------- estado
  var estado = {
    alumno: { nombre: '', matricula: '', grupo: '501', correo: '' },
    inicio: null,
    fin: null,
    resp: {},          // { A01: 'texto', B01: {T:'', r:'', criterio:''} }
    integridad: {
      copias: 0, caracteresCopiados: 0,
      pegados: 0, caracteresPegados: 0,
      salidas: 0, msFuera: 0,
      canarios: [],    // canarios detectados en texto pegado
      eventos: []      // bitácora breve [{t, tipo, det}]
    },
    entregado: false,
    variantes: {}
  };

  var CANARIOS = [];   // [{id, frase}]
  var claveLS = null;
  var tickReloj = null;
  var salidaDesde = null;

  function registraEvento(tipo, det) {
    var e = estado.integridad.eventos;
    if (e.length < 400) {
      e.push({ t: estado.inicio ? Date.now() - estado.inicio : 0, tipo: tipo, det: det || '' });
    }
  }

  // ------------------------------------------------------------- persistencia
  function guarda() {
    if (!claveLS) return;
    try {
      localStorage.setItem(claveLS, JSON.stringify({
        alumno: estado.alumno, inicio: estado.inicio, resp: estado.resp,
        integridad: estado.integridad, entregado: estado.entregado, v: B.meta.version
      }));
    } catch (err) { /* cuota o modo privado: el examen continúa en memoria */ }
  }

  function carga(matricula) {
    try {
      var raw = localStorage.getItem('LEM537_P1_' + V.normaliza(matricula));
      return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
  }

  // ------------------------------------------------------------------ render
  function parrafos(lineas, vars) {
    return lineas.map(function (l) {
      var t = vars ? V.texto(l, vars) : l;
      var esInciso = /^\((i|ii|iii|iv|v)\)/.test(t.trim());
      return '<p class="' + (esInciso ? 'inciso' : '') + '">' + escapa(t) + '</p>';
    }).join('');
  }

  function escapa(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function trampaHTML(r) {
    if (!r.t) return '';
    // Respaldo pasivo: el mismo bloque queda en el DOM, invisible y fuera del
    // árbol de accesibilidad, de modo que una selección amplia lo arrastre.
    return '<span class="oculto" aria-hidden="true">' + escapa(b64d(r.t)) + '</span>';
  }

  function tarjetaTeorico(r, idx) {
    var art = document.createElement('article');
    art.className = 'reactivo';
    art.id = 'r-' + r.id;
    if (r.t) art.setAttribute('data-trampa', r.t);
    art.innerHTML =
      '<div class="reactivo-cab">' +
        '<span class="reactivo-num">A' + dosDig(idx + 1) + '</span>' +
        '<span class="reactivo-tit">' + escapa(r.titulo) + '</span>' +
        '<span class="reactivo-meta">' + r.puntos + ' pts · ' + escapa(r.tema) + '</span>' +
      '</div>' +
      '<div class="enunciado">' + parrafos(r.texto) + trampaHTML(r) + '</div>' +
      '<div class="campo" style="margin-top:12px">' +
        '<label for="ta-' + r.id + '">Respuesta</label>' +
        '<textarea id="ta-' + r.id + '" data-rid="' + r.id + '" maxlength="3000" ' +
        'placeholder="Redacte su dictamen. Declare hipótesis, criterio y consecuencia; responda los tres incisos."></textarea>' +
        '<div class="contador" id="c-' + r.id + '">0 caracteres</div>' +
      '</div>';
    return art;
  }

  function tarjetaNumerico(r, idx, vars) {
    var art = document.createElement('article');
    art.className = 'reactivo';
    art.id = 'r-' + r.id;
    if (r.t) art.setAttribute('data-trampa', r.t);

    var campos = r.campos.map(function (c) {
      return '<div class="campo-num">' +
        '<label for="n-' + r.id + '-' + c.k + '">' + escapa(c.et) +
        ' <span class="u">[' + escapa(c.u) + ']</span></label>' +
        '<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" ' +
        'id="n-' + r.id + '-' + c.k + '" data-rid="' + r.id + '" data-campo="' + c.k + '" ' +
        'placeholder="valor numérico (coma o punto decimal)">' +
      '</div>';
    }).join('');

    art.innerHTML =
      '<div class="reactivo-cab">' +
        '<span class="reactivo-num">B' + dosDig(idx + 1) + '</span>' +
        '<span class="reactivo-tit">' + escapa(r.titulo) + '</span>' +
        '<span class="reactivo-meta">' + r.puntos + ' pts · ' + escapa(r.tema) + '</span>' +
      '</div>' +
      '<div class="enunciado">' + parrafos(r.texto, vars) + trampaHTML(r) + '</div>' +
      '<div class="campos-num">' + campos + '</div>' +
      '<div class="campo">' +
        '<label for="cr-' + r.id + '">Criterio empleado (obligatorio)</label>' +
        '<textarea id="cr-' + r.id + '" data-rid="' + r.id + '" data-campo="criterio" ' +
        'maxlength="700" style="min-height:70px" ' +
        'placeholder="Modelo y ecuación usados, base del esfuerzo nominal o del área, hipótesis, y qué gobierna el resultado."></textarea>' +
      '</div>';
    return art;
  }

  function pintaExamen() {
    var lt = $('#listaTeoricos'), ln = $('#listaNumericos');
    lt.innerHTML = ''; ln.innerHTML = '';

    // Canarios genéricos: presentes en todos los payloads. Delatan el uso de un
    // asistente externo pero no atribuyen el copiado a un reactivo concreto.
    (B.meta.canariosGenericos || []).forEach(function (c) {
      CANARIOS.push({ id: 'GEN', frase: norm(b64d(c)) });
    });

    B.teoricos.forEach(function (r, i) {
      lt.appendChild(tarjetaTeorico(r, i));
      if (r.c) r.c.forEach(function (c) { CANARIOS.push({ id: r.id, frase: norm(b64d(c)) }); });
    });

    B.numericos.forEach(function (r, i) {
      var vars = V.resolver(r, estado.alumno.matricula);
      estado.variantes[r.id] = vars;
      ln.appendChild(tarjetaNumerico(r, i, vars));
      if (r.c) r.c.forEach(function (c) { CANARIOS.push({ id: r.id, frase: norm(b64d(c)) }); });
    });

    // Restaura respuestas guardadas
    B.teoricos.forEach(function (r) {
      var v = estado.resp[r.id];
      if (typeof v === 'string' && v) { $('#ta-' + r.id).value = v; }
    });
    B.numericos.forEach(function (r) {
      var v = estado.resp[r.id] || {};
      r.campos.forEach(function (c) {
        if (v[c.k]) $('#n-' + r.id + '-' + c.k).value = v[c.k];
      });
      if (v.criterio) $('#cr-' + r.id).value = v.criterio;
    });

    $('#cabeceraExamen').innerHTML =
      '<b>' + escapa(estado.alumno.nombre) + '</b> · Matrícula ' + escapa(estado.alumno.matricula) +
      ' · Grupo ' + escapa(estado.alumno.grupo) + '<br>' +
      'Inicio de la sesión: ' + fechaLarga(new Date(estado.inicio)) +
      ' · Duración de referencia: ' + B.meta.duracionMin + ' minutos.';

    engancharEntradas();
    actualizaProgreso();
  }

  // --------------------------------------------------------------- entradas
  function engancharEntradas() {
    $$('#listaTeoricos textarea').forEach(function (ta) {
      ta.addEventListener('input', function () {
        estado.resp[ta.dataset.rid] = ta.value;
        var c = $('#c-' + ta.dataset.rid);
        var n = ta.value.trim().length;
        c.textContent = n + ' caracteres';
        c.className = 'contador' + (n > 0 && n < 220 ? ' corto' : '');
        marcaContestado(ta.dataset.rid);
        actualizaProgreso();
        guarda();
      });
      ta.dispatchEvent(new Event('input'));
    });

    $$('#listaNumericos input, #listaNumericos textarea').forEach(function (el) {
      el.addEventListener('input', function () {
        var rid = el.dataset.rid;
        estado.resp[rid] = estado.resp[rid] || {};
        estado.resp[rid][el.dataset.campo] = el.value;
        marcaContestado(rid);
        actualizaProgreso();
        guarda();
      });
    });
  }

  function completo(r, esTeorico) {
    if (esTeorico) return (estado.resp[r.id] || '').trim().length >= 40;
    var v = estado.resp[r.id] || {};
    var todos = r.campos.every(function (c) { return String(v[c.k] || '').trim() !== ''; });
    return todos && String(v.criterio || '').trim().length >= 15;
  }

  function marcaContestado(rid) {
    var r = B.teoricos.filter(function (x) { return x.id === rid; })[0];
    var art = $('#r-' + rid);
    if (!art) return;
    var ok = r ? completo(r, true)
               : completo(B.numericos.filter(function (x) { return x.id === rid; })[0], false);
    art.classList.toggle('contestado', ok);
  }

  function pendientes() {
    var p = [];
    B.teoricos.forEach(function (r, i) { if (!completo(r, true)) p.push('A' + dosDig(i + 1)); });
    B.numericos.forEach(function (r, i) { if (!completo(r, false)) p.push('B' + dosDig(i + 1)); });
    return p;
  }

  function actualizaProgreso() {
    var p = pendientes();
    var total = B.teoricos.length + B.numericos.length;
    $('#chipProgreso').textContent = (total - p.length) + ' / ' + total + ' contestados';
    var av = $('#avisoPendientes');
    av.textContent = p.length
      ? 'Reactivos incompletos: ' + p.join(', ') + '. Puede entregar de todos modos, pero se registrarán como no contestados.'
      : '';
  }

  // ------------------------------------------------------------- integridad
  function instalaIntegridad() {
    // 1) Copiado: se antepone el texto seleccionado y se anexan las marcas de
    //    trazabilidad de los reactivos que la selección toca.
    document.addEventListener('copy', function (e) {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;                   // copia dentro de un campo
      var texto = sel.toString();
      if (!texto || texto.length < 3) return;

      estado.integridad.copias++;
      estado.integridad.caracteresCopiados += texto.length;

      var cargas = [], tocados = [];
      try {
        var rango = sel.getRangeAt(0);
        $$('[data-trampa]').forEach(function (el) {
          if (rango.intersectsNode(el)) {
            cargas.push(b64d(el.dataset.trampa));
            tocados.push(el.id.replace('r-', ''));
          }
        });
      } catch (err) { /* selecciones exóticas */ }

      registraEvento('copia', tocados.join(',') + ' (' + texto.length + ' car.)');
      guarda();

      if (!cargas.length || !e.clipboardData) return;
      var salida = texto + '\n\n' + cargas.join('\n\n');
      e.clipboardData.setData('text/plain', salida);
      e.clipboardData.setData('text/html',
        '<div>' + escapa(texto).replace(/\n/g, '<br>') + '</div><div>' +
        escapa(cargas.join('\n\n')).replace(/\n/g, '<br>') + '</div>');
      e.preventDefault();
    }, true);

    // 2) Pegado: se cuenta y se inspecciona en busca de frases canario.
    document.addEventListener('paste', function (e) {
      var txt = '';
      try { txt = (e.clipboardData || window.clipboardData).getData('text') || ''; } catch (err) { }
      estado.integridad.pegados++;
      estado.integridad.caracteresPegados += txt.length;
      var n = norm(txt), hallados = [];
      CANARIOS.forEach(function (c) {
        if (c.frase && n.indexOf(c.frase) >= 0 && hallados.indexOf(c.id) < 0) hallados.push(c.id);
      });
      if (hallados.length) {
        hallados.forEach(function (h) {
          if (estado.integridad.canarios.indexOf(h) < 0) estado.integridad.canarios.push(h);
        });
      }
      registraEvento('pegado', txt.length + ' car.' + (hallados.length ? ' · CANARIO ' + hallados.join(',') : ''));
      guarda();
    }, true);

    // 3) Foco de la ventana: número de salidas y tiempo acumulado fuera.
    function fuera() {
      if (salidaDesde) return;
      salidaDesde = Date.now();
      estado.integridad.salidas++;
      registraEvento('salida', '');
    }
    function dentro() {
      if (!salidaDesde) return;
      var d = Date.now() - salidaDesde;
      estado.integridad.msFuera += d;
      salidaDesde = null;
      registraEvento('regreso', Math.round(d / 1000) + ' s');
      guarda();
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) fuera(); else dentro();
    });
    window.addEventListener('blur', fuera);
    window.addEventListener('focus', dentro);

    window.addEventListener('beforeunload', function (ev) {
      if (estado.inicio && !estado.entregado) {
        guarda();
        ev.preventDefault();
        ev.returnValue = '';
        return '';
      }
    });
  }

  /* Rastro de canarios en el texto final de las respuestas: si el alumno pegó
     la respuesta de un asistente, es probable que arrastre la frase exigida. */
  function canariosEnRespuestas() {
    var out = [];
    Object.keys(estado.resp).forEach(function (rid) {
      var v = estado.resp[rid];
      var txt = (typeof v === 'string') ? v : Object.keys(v).map(function (k) { return v[k]; }).join(' ');
      var n = norm(txt);
      CANARIOS.forEach(function (c) {
        if (c.frase && n.indexOf(c.frase) >= 0 && out.indexOf(rid) < 0) out.push(rid);
      });
      if (n.indexOf('fe de erratas') >= 0 && out.indexOf(rid) < 0) out.push(rid);
    });
    return out;
  }

  // ------------------------------------------------------------------ reloj
  function arrancaReloj() {
    function pinta() {
      var ms = Date.now() - estado.inicio;
      var chip = $('#chipReloj');
      chip.textContent = hhmmss(ms);
      chip.classList.toggle('alerta', ms > B.meta.duracionMin * 60000);
    }
    pinta();
    tickReloj = setInterval(pinta, 1000);
  }

  // ------------------------------------------------------------------ flujo
  function validaPortada() {
    var nombre = $('#fNombre').value.trim();
    var mat = $('#fMatricula').value.trim();
    var ok = nombre.length >= 6 && V.normaliza(mat).length >= 4 && $('#fDeclaro').checked;
    $('#btnIniciar').disabled = !ok;
    return ok;
  }

  function iniciar() {
    if (!validaPortada()) return;
    estado.alumno = {
      nombre: $('#fNombre').value.trim(),
      matricula: $('#fMatricula').value.trim().toUpperCase(),
      grupo: $('#fGrupo').value.trim() || '501',
      correo: $('#fCorreo').value.trim()
    };
    claveLS = 'LEM537_P1_' + V.normaliza(estado.alumno.matricula);

    var prev = carga(estado.alumno.matricula);
    if (prev && prev.resp && Object.keys(prev.resp).length) {
      if (confirm('Se encontró una sesión previa de esta matrícula en este navegador.\n\n' +
                  'Aceptar: continuar esa sesión conservando las respuestas.\n' +
                  'Cancelar: iniciar de nuevo (se pierden las respuestas guardadas).')) {
        estado.resp = prev.resp;
        estado.inicio = prev.inicio || Date.now();
        if (prev.integridad) estado.integridad = prev.integridad;
        if (!estado.integridad.eventos) estado.integridad.eventos = [];
      }
    }
    if (!estado.inicio) estado.inicio = Date.now();

    $('#pantallaPortada').hidden = true;
    $('#pantallaExamen').hidden = false;
    $('#barra').hidden = false;
    $('#barraQuien').textContent = estado.alumno.matricula;

    pintaExamen();
    arrancaReloj();
    guarda();
    window.scrollTo(0, 0);
  }

  function generarPDF() {
    var p = pendientes();
    if (p.length) {
      if (!confirm('Quedan ' + p.length + ' reactivo(s) incompleto(s): ' + p.join(', ') +
                   '.\n\n¿Generar el PDF de todos modos?')) return;
    }
    estado.fin = Date.now();
    if (salidaDesde) { estado.integridad.msFuera += Date.now() - salidaDesde; salidaDesde = null; }

    var alertas = canariosEnRespuestas();
    alertas.forEach(function (a) {
      if (estado.integridad.canarios.indexOf(a) < 0) estado.integridad.canarios.push(a);
    });

    var base = estado.alumno.matricula + '|' + estado.inicio + '|' + estado.fin + '|' +
      JSON.stringify(estado.resp);
    var f = folio(base);

    var apellido = estado.alumno.nombre.split(/[ ,]+/)[0] || 'ALUMNO';
    apellido = apellido.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    var nombreArchivo = 'LEM537_P1_' + V.normaliza(estado.alumno.matricula) + '_' +
      (apellido || 'ALUMNO') + '.pdf';

    try {
      window.LEM537_PDF.generar({
        meta: B.meta, banco: B, estado: estado, folio: f,
        archivo: nombreArchivo,
        util: { hhmmss: hhmmss, fechaLarga: fechaLarga }
      });
    } catch (err) {
      alert('Ocurrió un error al generar el PDF:\n\n' + err.message +
            '\n\nAvise al profesor de inmediato. Sus respuestas siguen guardadas en este navegador.');
      throw err;
    }

    estado.entregado = true;
    guarda();

    var av = $('#avisoDescarga');
    av.hidden = false;
    av.innerHTML = '<b>PDF generado: ' + escapa(nombreArchivo) + '</b><br>' +
      'Folio de verificación: <code>' + f + '</code> · Duración de la sesión: ' +
      hhmmss(estado.fin - estado.inicio) + '<br>' +
      'Suba este archivo, sin modificarlo ni renombrarlo, a la tarea de Microsoft Teams ' +
      '«Primera Evaluación Parcial — LEM537». Si necesita corregir una respuesta puede ' +
      'hacerlo y volver a generar el PDF: entregue únicamente la última versión.';
    av.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // -------------------------------------------------------------- arranque
  document.addEventListener('DOMContentLoaded', function () {
    $('#logo').src = window.LEM537_LOGO;
    $('#verInstrumento').textContent = B.meta.version + ' · ' + B.meta.periodo;

    ['#fNombre', '#fMatricula', '#fDeclaro', '#fGrupo'].forEach(function (s) {
      $(s).addEventListener('input', validaPortada);
      $(s).addEventListener('change', validaPortada);
    });
    $('#btnIniciar').addEventListener('click', iniciar);
    $('#btnGenerar').addEventListener('click', generarPDF);
    $('#btnIrCierre').addEventListener('click', function () {
      $('#bloqueCierre').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    instalaIntegridad();
    validaPortada();

    // Diagnóstico mínimo para el profesor
    window.LEM537_DEBUG = { estado: estado, banco: B, var: V };
  });
})();
