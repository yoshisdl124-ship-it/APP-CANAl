"""
EL CAUDALOSO - Hidráulica de canales abiertos
Escuela Profesional de Ingeniería Civil, UNCP

Requiere Python 3 con tkinter. Para los gráficos suavizados, los íconos y la
portada se recomienda Pillow (pip install pillow); sin él, el programa funciona
con un dibujo más sencillo.
"""

import json
import math
import os
import random
import time
import tkinter as tk
import tkinter.font as tkfont
from datetime import datetime
from tkinter import ttk

try:  # Pillow da gráficos suavizados; sin él se usa el dibujo básico de Tkinter
  from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageTk
  HAY_PIL = True
except Exception:
  HAY_PIL = False

# ======================================================================
# PALETA Y TIPOGRAFÍA
# ======================================================================
BG = "#0F1B27"         # fondo general
SURFACE = "#162534"    # tarjetas y paneles
SURFACE2 = "#1B2F42"   # mosaicos y botones suaves
FIELD = "#0D1923"      # campos de entrada
HOVER = "#1B3044"
INK = "#E6EEF4"        # texto principal
MUTED = "#8DA4B6"
DISABLED = "#5A7388"
LINE = "#25405A"
WATER = "#2FB3CC"      # acento
WATER_DK = "#56CBE0"   # acento claro para valores y textos destacados
WATER_LT = "#2A7F99"   # relleno de agua en íconos
AGUA_SUP = "#8BE0EE"
AGUA_FONDO = "#17708A"
AMBAR = "#F0A94B"      # borde libre
REVEST = "#8C9BA7"     # revestimiento
GRAMA = "#78A25A"
SIDE_BG = "#09131C"    # menú lateral
SIDE_HOVER = "#0F2030"
SIDE_ACTIVE = "#152B3D"
SIDE_TEXT = "#B7CAD8"
SIDE_MUTED = "#6F8CA1"
TINTE = "#123447"      # banda del resultado principal
BTN = "#1C93AD"
BTN_HOVER = "#27AAC6"
BTN_PRESS = "#157A91"
ESTILO_SCROLL = "Vertical.TScrollbar"
TIERRA_LINEA = "#B39A70"
SOIL = "#6C5A41"
SOIL_DK = "#A88E66"
DANGER = "#FF8C7C"
ERROR_BG = "#3A1F26"

G = 9.81
SECCIONES = ["Trapezoidal", "Rectangular", "Triangular", "Circular"]

FAMILIA = "Helvetica"


def init_fonts():
  """Elige la mejor fuente disponible en el sistema."""
  global FAMILIA
  disponibles = set(tkfont.families())
  for nombre in ("Segoe UI", "SF Pro Text", "Helvetica Neue", "Noto Sans",
                 "DejaVu Sans", "Arial"):
    if nombre in disponibles:
      FAMILIA = nombre
      return


def fnt(size, weight="normal"):
  return (FAMILIA, size, weight)


# ======================================================================
# HIDRÁULICA
# ======================================================================
def geometria(tipo, y, b, z, d):
  """Devuelve área A, perímetro mojado P y espejo de agua T."""
  if tipo == "Trapezoidal":
    A = (b + z * y) * y
    P = b + 2 * y * math.sqrt(1 + z**2)
    T = b + 2 * z * y
  elif tipo == "Rectangular":
    A = b * y
    P = b + 2 * y
    T = b
  elif tipo == "Triangular":
    A = z * y**2
    P = 2 * y * math.sqrt(1 + z**2)
    T = 2 * z * y
  elif tipo == "Circular":
    r = d / 2.0
    y = min(y, d)
    val = max(-1.0, min(1.0, 1.0 - y / r))
    theta = 2.0 * math.acos(val)
    A = (r**2 / 2.0) * (theta - math.sin(theta))
    P = r * theta
    T = 2.0 * r * math.sin(theta / 2.0)
  else:
    A = P = T = 0.0
  return A, P, T


def caudal_manning(tipo, y, b, z, d, S, n):
  A, P, _ = geometria(tipo, y, b, z, d)
  if A <= 0 or P <= 0:
    return 0.0
  return (1.0 / n) * A * (A / P) ** (2 / 3) * math.sqrt(S)


def froude(V, A, T):
  D = A / T if T > 0 else 0.0
  return V / math.sqrt(G * D) if D > 0 else 0.0


def regimen(Fr):
  if Fr < 0.99:
    return "Subcrítico"
  if Fr > 1.01:
    return "Supercrítico"
  return "Crítico"


def biseccion(func, lo, hi, expandir=True, tol=1e-9, max_iter=300):
  """Raíz de func en [lo, hi]. Si no hay cambio de signo, amplía hi."""
  flo, fhi = func(lo), func(hi)
  intentos = 0
  while flo * fhi > 0 and expandir and intentos < 8:
    hi *= 2.0
    fhi = func(hi)
    intentos += 1
  if flo * fhi > 0:
    raise ValueError(
        "No se encontró una solución con esos datos. Si la sección es "
        "circular, el caudal puede superar la capacidad de la tubería."
    )
  for _ in range(max_iter):
    mid = (lo + hi) / 2.0
    fm = func(mid)
    if abs(fm) < tol or (hi - lo) < 1e-12:
      return mid
    if flo * fm < 0:
      hi, fhi = mid, fm
    else:
      lo, flo = mid, fm
  return (lo + hi) / 2.0


def primera_raiz(func, lo, hi, pasos=4000):
  """Menor raíz de func en [lo, hi] (func negativa en lo).

  Se usa cuando Q(y) puede no ser monótona (por ejemplo, al desbordar a las
  planicies de una sección compuesta).
  """
  a, fa = lo, func(lo)
  for i in range(1, pasos + 1):
    c = lo + (hi - lo) * i / pasos
    fc = func(c)
    if fa * fc <= 0:
      return biseccion(func, a, c, expandir=False)
    a, fa = c, fc
  raise ValueError(
      "No se encontró un tirante que conduzca ese caudal. Revise los datos."
  )


# ---------- Cowan: (nombre, valor mínimo, valor máximo) ----------
COWAN = {
    "n0": [("Tierra", 0.020, 0.020), ("Roca cortada", 0.025, 0.025),
           ("Grava fina", 0.024, 0.024), ("Grava gruesa", 0.028, 0.028)],
    "n1": [("Suave", 0.000, 0.000), ("Menor", 0.005, 0.005),
           ("Moderado", 0.010, 0.010), ("Severo", 0.020, 0.020)],
    "n2": [("Gradual", 0.000, 0.000), ("Alternante ocasional", 0.005, 0.005),
           ("Alternante frecuente", 0.010, 0.015)],
    "n3": [("Despreciable", 0.000, 0.000), ("Menor", 0.010, 0.015),
           ("Apreciable", 0.020, 0.030), ("Severo", 0.040, 0.060)],
    "n4": [("Baja", 0.005, 0.010), ("Media", 0.010, 0.025),
           ("Alta", 0.025, 0.050), ("Muy alta", 0.050, 0.100)],
    "m5": [("Menor", 1.00, 1.00), ("Apreciable", 1.15, 1.15),
           ("Severa", 1.30, 1.30)],
}


def cowan_opciones(clave):
  """Devuelve {texto de la opción: (mínimo, máximo)}."""
  dec = 2 if clave == "m5" else 3
  out = {}
  for nombre, lo, hi in COWAN[clave]:
    rango = f"{lo:.{dec}f}" if lo == hi else f"{lo:.{dec}f}–{hi:.{dec}f}"
    out[f"{nombre} ({rango})"] = (lo, hi)
  return out


COWAN_OPC = {k: cowan_opciones(k) for k in COWAN}


# ---------- Rugosidad equivalente: partes = [(Pi, ni)] ----------
def n_horton(partes):
  """Horton-Einstein: misma velocidad media en todas las partes del perímetro."""
  P = sum(p for p, _ in partes)
  return (sum(p * n**1.5 for p, n in partes) / P) ** (2 / 3)


# ---------- Sección compuesta: canal principal + planicies ----------
def geom_canal(tipo, y, b, z, h):
  """A, P, T del canal principal de una sección compuesta.

  h es la profundidad del canal; en la forma semicircular h es el radio.
  """
  if tipo == "Semicircular":
    return geometria("Circular", y, 0.0, 0.0, 2.0 * h)
  return geometria(tipo, y, b, z, 0.0)


def _n_canal(tipo, b, P, rug):
  """n del canal principal: valor dado o Horton-Einstein entre fondo y taludes."""
  if rug[0] == "simple":
    return rug[1]
  _, ncf, nct, _, _ = rug
  if tipo == "Semicircular":
    raise ValueError(
        "La rugosidad compuesta no se aplica al canal semicircular. "
        "Use valor único o Cowan."
    )
  if tipo == "Triangular":
    return nct
  return n_horton([(b, ncf), (P - b, nct)])


def _n_planicie(B, hf, kf, rug):
  """n de una planicie: valor dado o Horton-Einstein entre fondo y talud exterior."""
  if rug[0] == "simple":
    return rug[2]
  return n_horton([(B, rug[3]), (hf * kf, rug[4])])


def subsecciones_compuesta(y, tipo, b, z, *args):
  """Lista de (nombre, A, P, n). Las interfaces verticales no suman perímetro.
  Soporta tanto llamada clásica: (y, tipo, b, z, h, Bi, Bd, zf, rug)
  como llamada asimétrica libre: (y, tipo, b, z, hi, hd, Bi, Bd, zfi, zfd, rug).
  """
  if len(args) == 5:
    hi = hd = args[0]
    Bi, Bd, zfi = args[1], args[2], args[3]
    zfd = zfi
    rug = args[4]
  elif len(args) == 7:
    hi, hd, Bi, Bd, zfi, zfd, rug = args
  else:
    raise ValueError("Parámetros de sección compuesta inválidos.")

  h_min = min(hi, hd)
  if y <= h_min:
    A, P, _ = geom_canal(tipo, y, b, z, h_min)
    return [("Canal principal", A, P, _n_canal(tipo, b, P, rug))]

  Ah, Ph, Th = geom_canal(tipo, h_min, b, z, h_min)
  hf_c = y - h_min
  subs = [("Canal principal", Ah + Th * hf_c, Ph, _n_canal(tipo, b, Ph, rug))]

  if y > hi and Bi > 0:
    hfi = y - hi
    kfi = math.sqrt(1 + zfi**2)
    subs.append(("Planicie izquierda", Bi * hfi + zfi * hfi**2 / 2, Bi + hfi * kfi,
                 _n_planicie(Bi, hfi, kfi, rug)))
  if y > hd and Bd > 0:
    hfd = y - hd
    kfd = math.sqrt(1 + zfd**2)
    subs.append(("Planicie derecha", Bd * hfd + zfd * hfd**2 / 2, Bd + hfd * kfd,
                 _n_planicie(Bd, hfd, kfd, rug)))
  return subs


def caudales_compuesta(subs, S):
  """Caudal por subsecciones: devuelve (Q total, [Qi], A total, P total)."""
  raiz_s = math.sqrt(S)
  qs = [
      (1.0 / n) * A * (A / P) ** (2 / 3) * raiz_s if A > 0 and P > 0 else 0.0
      for _, A, P, n in subs
  ]
  return sum(qs), qs, sum(s[1] for s in subs), sum(s[2] for s in subs)


def clasificar_remanso(yn, yc, y):
  """Devuelve (tipo de pendiente, perfil, descripción)."""
  if yn > yc:
    tipo = "Suave (M)"
    if y > yn:
      perfil = "M1"
      desc = ("Tirante sobre yn con flujo subcrítico. El tirante aumenta hacia"
              " aguas abajo (remanso).")
    elif y > yc:
      perfil = "M2"
      desc = ("Tirante entre yc e yn con flujo subcrítico. El tirante"
              " disminuye hacia aguas abajo (curva de caída).")
    else:
      perfil = "M3"
      desc = ("Tirante bajo yc con flujo supercrítico. El tirante aumenta"
              " hacia aguas abajo hasta formar un resalto.")
  elif yn < yc:
    tipo = "Empinada (S)"
    if y > yc:
      perfil = "S1"
      desc = ("Tirante sobre yc con flujo subcrítico. El tirante aumenta hacia"
              " aguas abajo y se une al flujo normal con un resalto.")
    elif y > yn:
      perfil = "S2"
      desc = ("Tirante entre yn e yc con flujo supercrítico. El tirante"
              " disminuye hacia aguas abajo, acercándose a yn.")
    else:
      perfil = "S3"
      desc = ("Tirante bajo yn con flujo supercrítico. El tirante aumenta hacia"
              " aguas abajo, acercándose a yn.")
  else:
    tipo = "Crítica (C)"
    perfil = "C1" if y > yn else "C3"
    desc = "Con pendiente crítica solo existen los perfiles C1 y C3."
  if abs(y - yn) < 1e-9:
    perfil = "Flujo uniforme"
    desc = "El tirante coincide con yn: no hay curva de remanso."
  return tipo, perfil, desc


# ======================================================================
# DIBUJO DE LA SECCIÓN TRANSVERSAL
# ======================================================================
def _mezcla(c1, c2, t):
  """Color intermedio entre dos colores hexadecimales (t de 0 a 1)."""
  t = max(0.0, min(1.0, t))
  a = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
  b = [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
  return "#%02x%02x%02x" % tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _bandas_agua(cv, X, Y, izq, der, l0, l1, ysup, n=14):
  """Agua con degradado: bandas horizontales entre los niveles l0 y l1."""
  for i in range(n):
    a = l0 + (l1 - l0) * i / n
    b = l0 + (l1 - l0) * (i + 1) / n
    t = (ysup - (a + b) / 2) / ysup if ysup > 0 else 0.0
    col = _mezcla(AGUA_SUP, AGUA_FONDO, t)
    cv.create_polygon(
        [X(izq(a)), Y(a), X(der(a)), Y(a), X(der(b)), Y(b), X(izq(b)), Y(b)],
        fill=col, outline=col)


def _granulos(cv, X, Y, caja, en_suelo, n=100, semilla=5):
  """Puntos que dan textura al terreno (siempre los mismos, sin parpadeo)."""
  rnd = random.Random(semilla)
  for _ in range(n):
    x = rnd.uniform(caja[0], caja[1])
    l = rnd.uniform(caja[2], caja[3])
    if en_suelo(x, l):
      r = rnd.choice((0.8, 1.1, 1.5))
      cv.create_oval(X(x) - r, Y(l) - r, X(x) + r, Y(l) + r,
                     fill=SOIL_DK, outline="")


def _etiqueta(cv, x, y, texto, anchor="w", negrita=False, color=INK, tam=9):
  """Texto sobre una pequeña placa blanca para que se lea sobre cualquier fondo."""
  t = cv.create_text(x, y, text=texto, anchor=anchor, fill=color,
                     font=fnt(tam, "bold" if negrita else "normal"))
  bb = cv.bbox(t) if t is not None else None
  if bb:
    r = cv.create_rectangle(bb[0] - 4, bb[1] - 1, bb[2] + 4, bb[3] + 1,
                            fill=SURFACE, outline=LINE)
    cv.tag_lower(r, t)


def _cota_v(cv, x, y1, y2, color=INK):
  cv.create_line(x, y1, x, y2, arrow="both", arrowshape=(6, 8, 3),
                 fill=color, width=1.5)


def _cota_h(cv, x1, x2, y, color=MUTED):
  cv.create_line(x1, y, x2, y, arrow="both", arrowshape=(6, 8, 3),
                 fill=color, width=1.2)
  for x in (x1, x2):
    cv.create_line(x, y - 4, x, y + 4, fill=color)


def _dim(cv):
  """Ancho real del lienzo (si ya se mostró) y alto configurado."""
  w = cv.winfo_width()
  return (w if w > 100 else int(cv["width"])), int(cv["height"])


def dibujar_seccion(cv, tipo, y=None, b=1.0, z=1.0, d=1.0, etiqueta="y",
                    bl=None, revest=False):
  """Sección transversal con agua, terreno y cotas.

  bl:     borde libre; si se indica, el canal se dibuja hasta y + bl.
  revest: dibuja el revestimiento de las paredes.
  """
  cv.delete("all")
  W, H = _dim(cv)

  if y is None:
    cv.create_text(W / 2, H / 2, text="La sección aparecerá aquí al calcular.",
                   fill=MUTED, font=fnt(10))
    return

  circ = tipo == "Circular"
  abierto = circ and bl is not None      # canal semicircular con paredes verticales
  if tipo == "Rectangular":
    z = 0.0
  if tipo == "Triangular":
    b = 0.0
  r = d / 2.0
  y_agua = min(y, d) if circ else y
  pad_x, pad_top, pad_bot = 64, 30, 36

  if circ:
    alto = y + bl if abierto else d

    def wc(l):
      if abierto and l >= r:
        return r
      return math.sqrt(max(l * (d - l), 0.0))
  else:
    alto = y + bl if bl is not None else y * 1.35

    def wc(l):
      return b / 2 + z * l

  # ---------- tubería circular (conducto cerrado) ----------
  if circ and not abierto:
    esc = min((W - 2 * pad_x) / d, (H - pad_top - pad_bot) / d)

    def X(x):
      return W / 2 + x * esc

    def Y(l):
      return H - pad_bot - l * esc

    cv.create_oval(X(-r), Y(d), X(r), Y(0), fill=SURFACE, outline="")
    if y_agua > 0:
      _bandas_agua(cv, X, Y, lambda l: -wc(l), lambda l: wc(l), 0.0, y_agua, y_agua, n=18)
      hw = wc(y_agua)
      cv.create_line(X(-hw), Y(y_agua), X(hw), Y(y_agua), fill=WATER_DK, width=2)
    cv.create_oval(X(-r), Y(d), X(r), Y(0), fill="", outline=REVEST, width=8)
    cv.create_oval(X(-r), Y(d), X(r), Y(0), fill="", outline=INK, width=2)
    xa = X(0)
    _cota_v(cv, xa, Y(0) - 1, Y(y_agua) + 1)
    _etiqueta(cv, xa + 9, (Y(0) + Y(y_agua)) / 2, f"{etiqueta} = {y:.3f} m",
              negrita=True, tam=10)
    ym = Y(0) + 20
    _cota_h(cv, X(-r), X(r), ym)
    _etiqueta(cv, X(0), ym, f"D = {d:.2f} m", anchor="center")
    return

  # ---------- canales abiertos ----------
  w_top = wc(alto)
  ext = 0.5 * w_top + 0.15 * alto
  th = 0.22 * alto
  esc = min((W - 2 * pad_x) / (2 * (w_top + ext)),
            (H - pad_top - pad_bot) / (alto + th))
  base = H - pad_bot - th * esc

  def X(x):
    return W / 2 + x * esc

  def Y(l):
    return base - l * esc

  if abierto:
    n = 36
    niveles = [alto] + [r * (1 - i / n) for i in range(n + 1)]
  else:
    niveles = [alto, 0.0]
  izq_p = [(-wc(l), l) for l in niveles]
  der_p = [(wc(l), l) for l in reversed(niveles)]
  xo = w_top + ext

  # terreno
  terreno = [(-xo, alto)] + izq_p + der_p + [(xo, alto), (xo, -th), (-xo, -th)]
  cv.create_polygon([c for x, l in terreno for c in (X(x), Y(l))],
                    fill=SOIL, outline="")
  m = 4 / esc
  _granulos(cv, X, Y, (-xo, xo, -th, alto),
            lambda x, l: l < 0 or abs(x) > wc(l) + m)
  cv.create_line(X(-xo), Y(-th), X(xo), Y(-th), fill=SOIL_DK, width=2)
  cv.create_line(X(-xo), Y(alto), X(-w_top), Y(alto), fill=GRAMA, width=3)
  cv.create_line(X(w_top), Y(alto), X(xo), Y(alto), fill=GRAMA, width=3)

  # agua
  if y_agua > 0:
    _bandas_agua(cv, X, Y, lambda l: -wc(l), lambda l: wc(l), 0.0, y_agua, y_agua)
    hw = wc(y_agua)
    cv.create_line(X(-hw), Y(y_agua), X(hw), Y(y_agua), fill=WATER_DK, width=2)
    if hw * esc > 14:
      cv.create_line(X(-hw) + 8, Y(y_agua) + 4, X(hw) - 8, Y(y_agua) + 4,
                     fill="#FFFFFF", width=1)

  # paredes
  pts = [c for x, l in izq_p + der_p for c in (X(x), Y(l))]
  if revest:
    cv.create_line(pts, fill=REVEST, width=8, joinstyle="round", capstyle="round")
    cv.create_line(pts, fill=INK, width=2, joinstyle="round", capstyle="round")
  else:
    cv.create_line(pts, fill=TIERRA_LINEA, width=3, joinstyle="round", capstyle="round")

  # corona del canal (borde libre)
  if bl is not None:
    cv.create_line(X(-w_top), Y(alto), X(w_top), Y(alto), fill=AMBAR, width=2, dash=(6, 3))

  # cotas
  xa = X(0)
  _cota_v(cv, xa, Y(0) - 1, Y(y_agua) + 1)
  _etiqueta(cv, xa + 9, (Y(0) + Y(y_agua)) / 2, f"{etiqueta} = {y:.3f} m",
            negrita=True, tam=10)
  if bl is not None:
    _cota_v(cv, xa, Y(y_agua) - 1, Y(alto) + 1, color=AMBAR)
    _etiqueta(cv, xa - 9, (Y(y_agua) + Y(alto)) / 2, f"BL = {bl:.2f} m",
              anchor="e", negrita=True, color=AMBAR)
    if revest is not None:
      cv.create_text(10, 8, text="Canal revestido" if revest else "Canal en tierra",
                     anchor="nw", fill=MUTED, font=fnt(9))
  if abierto:
    ym = Y(-th / 2)
    _cota_h(cv, X(-r), X(r), ym)
    _etiqueta(cv, X(0), ym, f"D = {d:.2f} m", anchor="center")
  elif not circ and b > 0:
    ym = Y(-th / 2)
    _cota_h(cv, X(-b / 2), X(b / 2), ym)
    _etiqueta(cv, X(0), ym, f"b = {b:.2f} m", anchor="center")


def _semiancho_canal(tipo, b, z, h, l):
  """Semiancho del canal principal a la altura l (h es el radio si es semicircular)."""
  if tipo == "Semicircular":
    return math.sqrt(max(l * (2 * h - l), 0.0))
  if tipo == "Triangular":
    return z * l
  return b / 2 + (0.0 if tipo == "Rectangular" else z) * l


def dibujar_compuesta(cv, y, b, z, h, Bi, Bd, zf, etiqueta="y", tipo="Trapezoidal"):
  """Canal principal (cualquier forma) con planicies de inundación a cada lado."""
  cv.delete("all")
  W, Hc = _dim(cv)

  def wc(l):
    return _semiancho_canal(tipo, b, z, h, l)

  Hd = max(y, h) * 1.25
  xc = wc(h)                         # borde superior del canal principal
  xl, xr = -(xc + Bi), xc + Bd       # bordes exteriores de las planicies
  dz = zf * (Hd - h)
  th = 0.18 * Hd
  pad_x, pad_top, pad_bot = 44, 26, 30
  ancho = (xr + dz) - (xl - dz)
  esc = min((W - 2 * pad_x) / ancho, (Hc - pad_top - pad_bot) / (Hd + th))
  base = Hc - pad_bot - th * esc
  cx = (xl + xr) / 2

  def X(x):
    return W / 2 + (x - cx) * esc

  def Y(l):
    return base - l * esc

  if tipo == "Semicircular":
    niveles = [h * (1 - i / 40) for i in range(41)]
  else:
    niveles = [h, 0.0]
  izq_p = [(-wc(l), l) for l in niveles]
  der_p = [(wc(l), l) for l in reversed(niveles)]
  perfil = [(xl - dz, Hd), (xl, h)] + izq_p + der_p + [(xr, h), (xr + dz, Hd)]

  # terreno
  terreno = perfil + [(xr + dz, -th), (xl - dz, -th)]
  cv.create_polygon([c for x, l in terreno for c in (X(x), Y(l))],
                    fill=SOIL, outline="")
  m = 4 / esc

  def en_suelo(x, l):
    if l < 0:
      return True
    if l <= h:
      return abs(x) > wc(l) + m
    if x >= 0:
      return x > xr + zf * (l - h) + m
    return x < xl - zf * (l - h) - m

  _granulos(cv, X, Y, (xl - dz, xr + dz, -th, Hd), en_suelo, n=150)
  cv.create_line(X(xl - dz), Y(-th), X(xr + dz), Y(-th), fill=SOIL_DK, width=2)

  # agua
  if y <= h:
    _bandas_agua(cv, X, Y, lambda l: -wc(l), lambda l: wc(l), 0.0, y, y)
    sup = (-wc(y), wc(y))
  else:
    _bandas_agua(cv, X, Y, lambda l: -wc(l), lambda l: wc(l), 0.0, h, y, n=10)
    _bandas_agua(cv, X, Y, lambda l: xl - zf * (l - h),
                 lambda l: xr + zf * (l - h), h, y, y, n=10)
    sup = (xl - zf * (y - h), xr + zf * (y - h))
  cv.create_line(X(sup[0]), Y(y), X(sup[1]), Y(y), fill=WATER_DK, width=2)
  if y > h:  # interfaces entre subsecciones
    for xi in (-xc, xc):
      cv.create_line(X(xi), Y(h), X(xi), Y(y), fill=INK, dash=(4, 3))

  # contorno del terreno y pasto en las planicies
  cv.create_line([c for x, l in perfil for c in (X(x), Y(l))],
                 fill=TIERRA_LINEA, width=3, joinstyle="round", capstyle="round")
  cv.create_line(X(xl), Y(h), X(-xc), Y(h), fill=GRAMA, width=3)
  cv.create_line(X(xc), Y(h), X(xr), Y(h), fill=GRAMA, width=3)

  # cotas
  xa = X(0)
  _cota_v(cv, xa, Y(0) - 1, Y(y) + 1)
  _etiqueta(cv, xa + 9, (Y(0) + Y(y)) / 2, f"{etiqueta} = {y:.3f} m",
            negrita=True, tam=10)
  texto_h = f"r = {h:.2f} m" if tipo == "Semicircular" else f"h = {h:.2f} m"
  _etiqueta(cv, X(xl) + 6, Y(h) + 13, texto_h)
  _etiqueta(cv, X(xr) - 6, Y(h) + 13, f"Bd = {Bd:.2f} m", anchor="e")
  _etiqueta(cv, X(xl) + 6, Y(h) + 31, f"Bi = {Bi:.2f} m")


# ======================================================================
# ICONOS DE LAS TARJETAS (84 x 56)
# ======================================================================
def icono(cv, kind):
  cv.delete("all")

  def canal(nivel=28, dash=False):
    # trapecio base: borde sup. y=10, fondo y=46
    xl = 8 + 16 * (nivel - 10) / 36.0
    xr = 76 - 16 * (nivel - 10) / 36.0
    cv.create_polygon(xl, nivel, xr, nivel, 60, 46, 24, 46, fill=WATER_LT, outline="")
    cv.create_line(xl, nivel, xr, nivel, fill=WATER_DK, width=2, dash=(3, 2) if dash else ())
    cv.create_line(8, 10, 24, 46, 60, 46, 76, 10, fill=INK, width=2, joinstyle="round")

  if kind == "normal":
    canal(28)
  elif kind == "critico":
    canal(32)
    cv.create_line(8, 16, 76, 16, fill=WATER_DK, dash=(4, 3))
    cv.create_line(42, 16, 42, 32, fill=INK, arrow="last")
  elif kind == "meh":
    cv.create_arc(8, -22, 76, 46, start=180, extent=180, style="arc", outline=MUTED, dash=(3, 2))
    cv.create_polygon(12, 22, 72, 22, 59, 41, 25, 41, fill=WATER_LT, outline="")
    cv.create_line(8, 12, 25, 41, 59, 41, 76, 12, fill=INK, width=2, joinstyle="round")
  elif kind == "minima":
    cv.create_polygon(12, 22, 72, 22, 62, 40, 22, 40, fill=WATER_LT, outline="")
    cv.create_line(8, 14, 20, 40, 64, 40, 76, 14, fill=INK, width=2, joinstyle="round")
    for x in (30, 42, 54):
      cv.create_line(x, 44, x, 52, fill=SOIL_DK, arrow="last")
  elif kind == "resalto":
    cv.create_polygon(6, 38, 28, 38, 40, 16, 78, 16, 78, 48, 6, 48, fill=WATER_LT, outline="")
    cv.create_line(6, 38, 28, 38, 34, 24, 40, 16, 78, 16, fill=WATER_DK, width=2, smooth=True)
    cv.create_line(6, 48, 78, 48, fill=INK, width=2)
  elif kind == "remanso":
    cv.create_polygon(6, 36, 30, 34, 54, 26, 78, 12, 78, 48, 6, 48, fill=WATER_LT, outline="")
    cv.create_line(6, 36, 30, 34, 54, 26, 78, 12, fill=WATER_DK, width=2, smooth=True)
    cv.create_line(6, 36, 78, 36, fill=MUTED, dash=(3, 2))
    cv.create_line(6, 48, 78, 48, fill=INK, width=2)
  elif kind == "caudal":
    canal(24)
    for y in (32, 40):
      cv.create_line(30, y, 54, y, fill=WATER_DK, arrow="last", width=1.5)
  elif kind == "inverso":
    cv.create_polygon(8, 14, 76, 40, 8, 40, fill=WATER_LT, outline="")
    cv.create_line(8, 14, 76, 40, fill=INK, width=2)
    cv.create_line(8, 40, 76, 40, fill=MUTED, dash=(3, 2))
    cv.create_arc(40, 28, 90, 52, start=145, extent=35, style="arc", outline=WATER_DK, width=2)
  elif kind == "compuesta":
    cv.create_polygon(4, 14, 80, 14, 80, 22, 64, 22, 56, 46, 28, 46, 20, 22, 4, 22,
                      fill=WATER_LT, outline="")
    cv.create_line(4, 14, 80, 14, fill=WATER_DK, width=2)
    cv.create_line(20, 14, 20, 22, fill=MUTED, dash=(3, 2))
    cv.create_line(64, 14, 64, 22, fill=MUTED, dash=(3, 2))
    cv.create_line(4, 22, 20, 22, 28, 46, 56, 46, 64, 22, 80, 22,
                   fill=INK, width=2, joinstyle="round")


# ======================================================================
# GRÁFICOS SUAVIZADOS (Pillow): sección, íconos, logo y portada
# ======================================================================
SS = 3                      # se dibuja 3 veces más grande y se reduce (suavizado)
ALTO_GRAFICO = 270
ALTO_HERO = 168
_FUENTES = {}


def _fuente(px, negrita=False, marca=False):
  """Mejor fuente disponible (Segoe UI en Windows); Pillow usa su fuente interna si no hay otra."""
  clave = (int(px), negrita, marca)
  if clave in _FUENTES:
    return _FUENTES[clave]
  if marca:
    nombres = ["bahnschrift.ttf", "segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]
  elif negrita:
    nombres = ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"]
  else:
    nombres = ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf"]
  f = None
  for n in nombres:
    try:
      f = ImageFont.truetype(n, int(px))
      break
    except Exception:
      continue
  if f is None:
    try:
      f = ImageFont.load_default(size=int(px))
    except Exception:
      f = ImageFont.load_default()
  _FUENTES[clave] = f
  return f


def _rgb(color, alpha=None):
  c = color.lstrip("#")
  t = (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))
  return t if alpha is None else t + (alpha,)


def _trazo(dr, p, color, ancho, redondo=True, ss=SS):
  w = max(1, int(round(ancho * ss)))
  dr.line(p, fill=color, width=w, joint="curve")
  if redondo and w >= 3:
    r = w / 2.0
    puntos = p if len(p) <= 12 else [p[0], p[-1]]
    for x, y in puntos:
      dr.ellipse([x - r, y - r, x + r, y + r], fill=color)


def _discontinuo(dr, p, color, ancho, on=6, off=4, ss=SS):
  w = max(1, int(round(ancho * ss)))
  on, off = on * ss, off * ss
  resto, dibujar = on, True
  for (x0, y0), (x1, y1) in zip(p, p[1:]):
    largo = math.hypot(x1 - x0, y1 - y0)
    if largo == 0:
      continue
    pos = 0.0
    while pos < largo:
      paso = min(resto, largo - pos)
      if dibujar:
        a = (x0 + (x1 - x0) * pos / largo, y0 + (y1 - y0) * pos / largo)
        b = (x0 + (x1 - x0) * (pos + paso) / largo, y0 + (y1 - y0) * (pos + paso) / largo)
        dr.line([a, b], fill=color, width=w)
      pos += paso
      resto -= paso
      if resto <= 1e-9:
        dibujar = not dibujar
        resto = on if dibujar else off


def _punta(dr, desde, hacia, color, tam=7, ss=SS):
  """Triángulo de flecha con la punta en `hacia`."""
  ang = math.atan2(hacia[1] - desde[1], hacia[0] - desde[0])
  t = tam * ss
  p1 = (hacia[0] + t * math.cos(ang + math.pi - 0.42), hacia[1] + t * math.sin(ang + math.pi - 0.42))
  p2 = (hacia[0] + t * math.cos(ang + math.pi + 0.42), hacia[1] + t * math.sin(ang + math.pi + 0.42))
  dr.polygon([hacia, p1, p2], fill=color)


def _chaikin(p, vueltas=3):
  for _ in range(vueltas):
    nuevo = [p[0]]
    for (x0, y0), (x1, y1) in zip(p, p[1:]):
      nuevo.append((0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1))
      nuevo.append((0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1))
    nuevo.append(p[-1])
    p = nuevo
  return p


class _Lienzo:
  """Lienzo de Pillow con suavizado: se trabaja en píxeles lógicos."""

  def __init__(self, W, H, transparente=False):
    self.W, self.H = W, H
    base = (0, 0, 0, 0) if transparente else (255, 255, 255, 255)
    self.img = Image.new("RGBA", (W * SS, H * SS), base)
    self.d = ImageDraw.Draw(self.img)

  def pts(self, pts):
    return [(x * SS, y * SS) for x, y in pts]

  def _grad(self, c1, c2, y0, y1):
    h = self.H * SS
    col = Image.new("RGB", (1, h))
    span = (y1 - y0) or 1.0
    for fila in range(h):
      col.putpixel((0, fila), _rgb(_mezcla(c1, c2, (fila / SS - y0) / span)))
    return col.resize((self.W * SS, h))

  def fondo(self, c1, c2):
    self.img.paste(self._grad(c1, c2, 0, self.H), (0, 0))

  def degradado(self, pts, c1, c2, y0, y1):
    """Rellena el polígono con un degradado vertical; devuelve su máscara."""
    mascara = Image.new("L", self.img.size, 0)
    ImageDraw.Draw(mascara).polygon(self.pts(pts), fill=255)
    self.img.paste(self._grad(c1, c2, y0, y1), (0, 0), mascara)
    return mascara

  def capa(self):
    c = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
    return c, ImageDraw.Draw(c)

  def componer(self, capa, mascara=None):
    if mascara is not None:
      capa.putalpha(ImageChops.multiply(capa.getchannel("A"), mascara))
    self.img = Image.alpha_composite(self.img, capa)
    self.d = ImageDraw.Draw(self.img)

  def cota(self, a, b, color):
    a, b = (a[0] * SS, a[1] * SS), (b[0] * SS, b[1] * SS)
    _trazo(self.d, [a, b], _rgb(color), 1.7, redondo=False)
    if math.hypot(b[0] - a[0], b[1] - a[1]) > 20 * SS:
      _punta(self.d, b, a, _rgb(color))
      _punta(self.d, a, b, _rgb(color))
    else:
      for p in (a, b):
        self.d.ellipse([p[0] - 2 * SS, p[1] - 2 * SS, p[0] + 2 * SS, p[1] + 2 * SS], fill=_rgb(color))

  def etiqueta(self, x, y, texto, anchor="w", negrita=False, color=INK, tam=12,
               fondo="#0E1A26", borde="#35536C"):
    f = _fuente(tam * SS, negrita)
    bb = self.d.textbbox((0, 0), texto, font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    X, Y = x * SS, y * SS
    x0 = X if anchor == "w" else (X - w if anchor == "e" else X - w / 2)
    y0 = Y - h / 2
    px, py = 7 * SS, 4 * SS
    self.d.rounded_rectangle([x0 - px, y0 - py, x0 + w + px, y0 + h + py],
                             radius=(h / 2 + py), fill=_rgb(fondo), outline=_rgb(borde),
                             width=max(1, SS // 2))
    self.d.text((x0 - bb[0], y0 - bb[1]), texto, font=f, fill=_rgb(color))

  def final(self, redondeo=0):
    img = self.img
    if redondeo:
      m = Image.new("L", img.size, 0)
      ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1],
                                          radius=redondeo * SS, fill=255)
      img = img.copy()
      img.putalpha(ImageChops.multiply(img.getchannel("A"), m))
    else:
      img = img.convert("RGB")
    return img.resize((self.W, self.H), Image.LANCZOS)


TEMA_OSCURO = {
    "fondo": ("#1C3044", "#162534"),
    "suelo": ("#6F5C43", "#4A3D2D"), "suelo_borde": "#8E7755", "punto": (178, 152, 110),
    "pasto": "#7BA55C", "hoja": (140, 185, 104),
    "agua": ("#8BE0EE", "#17708A"), "linea_agua": "#D4F6FB",
    "pared": "#B8A074", "concreto": ("#7E8D99", "#E4EBF0"),
    "cota": "#E6EEF4", "cota2": "#9FB4C4",
    "pill": "#0E1A26", "pill_borde": "#35536C", "texto": "#E6EEF4", "muted": "#9FB4C4",
    "ambar": "#F0A94B", "ambar_borde": "#7A5A2E",
    "tub_int": ("#1B2F43", "#132230"), "tub_anillo": ("#6F7F8C", "#DCE5EB"),
    "veil": (22, 37, 52),
}
TEMA_CLARO = {
    "fondo": ("#F0F6FA", "#FFFFFF"),
    "suelo": ("#EBE0CA", "#CDB992"), "suelo_borde": "#B49C75", "punto": (150, 125, 85),
    "pasto": "#8DAA6A", "hoja": (110, 150, 80),
    "agua": ("#D3F0F6", "#46A9C0"), "linea_agua": "#17758A",
    "pared": "#7A6240", "concreto": ("#C7D1D8", "#66757F"),
    "cota": "#12283A", "cota2": "#5F7385",
    "pill": "#FFFFFF", "pill_borde": "#CBD7DF", "texto": "#12283A", "muted": "#5F7385",
    "ambar": "#C9822B", "ambar_borde": "#E8CFA6",
    "tub_int": ("#FAFCFD", "#EDF3F6"), "tub_anillo": ("#B7C3CC", "#5B6A75"),
    "veil": (255, 255, 255),
}
NF_ANIM = 10     # cuadros de la animación del agua


def _textura_suelo(L, T, X, Y, caja, en_suelo, n=240, semilla=5):
  rnd = random.Random(semilla)
  capa, dc = L.capa()
  r0, g0, b0 = T["punto"]
  for _ in range(n):
    x = rnd.uniform(caja[0], caja[1])
    l = rnd.uniform(caja[2], caja[3])
    if not en_suelo(x, l):
      continue
    px, py = X(x) * SS, Y(l) * SS
    if rnd.random() < 0.55:
      r = rnd.choice((0.8, 1.1, 1.6)) * SS
      dc.ellipse([px - r, py - r, px + r, py + r], fill=(r0, g0, b0, 150))
    else:
      largo = rnd.uniform(3, 7) * SS
      dc.line([px, py, px + largo, py - largo * 0.35], fill=(r0, g0, b0, 110),
              width=max(1, int(SS * 0.9)))
  L.componer(capa)


def _pasto(L, T, x0, x1, y, semilla=2):
  """Franja de pasto con briznas sobre la línea del terreno (x0 < x1, en px lógicos)."""
  if x1 - x0 < 2:
    return
  rnd = random.Random(semilla + int(x0))
  _trazo(L.d, L.pts([(x0, y), (x1, y)]), _rgb(T["pasto"]), 4.2)
  capa, dc = L.capa()
  x = x0 + 3
  while x < x1 - 2:
    alto = rnd.uniform(3, 7)
    dc.line([x * SS, y * SS, (x + rnd.uniform(-2, 2)) * SS, (y - alto) * SS],
            fill=T["hoja"] + (200,), width=max(1, SS))
    x += rnd.uniform(4, 8)
  L.componer(capa)


_CORRIENTES = ((0.28, 1, 26, 80), (0.45, 2, 18, 60), (0.62, 1, 30, 66),
               (0.78, 2, 22, 50), (0.36, 1, 20, 56), (0.70, 2, 16, 46))


def _capa_olas(W, H, x0, x1, ys, prof, fase):
  """Olas de la superficie y trazos de corriente; `fase` (0 a 1) se repite sin saltos."""
  capa = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
  dc = ImageDraw.Draw(capa)
  ph = 2 * math.pi * fase
  for k, (dep, alfa) in enumerate(((0.0, 165), (7.0, 105), (15.0, 62))):
    puntos, x = [], x0
    while x <= x1:
      puntos.append((x * SS, (ys + dep + 1.6 * math.sin((x - x0) / 17.0 + k * 1.7 + ph)) * SS))
      x += 3
    if len(puntos) > 1:
      _trazo(dc, puntos, (255, 255, 255, alfa), 1.5, redondo=False)
  ancho = max(x1 - x0, 1.0)
  for i, (f_prof, mult, largo, alfa) in enumerate(_CORRIENTES):
    xs = x0 + ((i * 0.37 + fase * mult) % 1.0) * ancho
    xe = min(xs + largo, x1)
    yy = ys + prof * f_prof
    if xe > xs:
      _trazo(dc, [(xs * SS, yy * SS), (xe * SS, yy * SS)], (255, 255, 255, alfa), 1.6)
  return capa


class _Escena:
  """Sección en capas: fondo (terreno y agua), olas animables y primer plano."""

  def __init__(self, W, H, tema):
    self.W, self.H, self.T = W, H, tema
    self.bg = _Lienzo(W, H)
    self.fg = _Lienzo(W, H, transparente=True)
    self.olas = None     # (máscara del agua, x0, x1, y de la superficie, profundidad en px)

  def pill(self, x, y, texto, **kw):
    kw.setdefault("color", self.T["texto"])
    kw.setdefault("fondo", self.T["pill"])
    kw.setdefault("borde", self.T["pill_borde"])
    self.fg.etiqueta(x, y, texto, **kw)

  def fotograma(self, fase=0.0):
    base = self.bg.img
    if self.olas is not None:
      mascara, x0, x1, ys, prof = self.olas
      capa = _capa_olas(self.W, self.H, x0, x1, ys, prof, fase)
      capa.putalpha(ImageChops.multiply(capa.getchannel("A"), mascara))
      base = Image.alpha_composite(base, capa)
    base = Image.alpha_composite(base, self.fg.img)
    return base.convert("RGB").resize((self.W, self.H), Image.BOX)


def escena_seccion(W, H, tipo, y=None, b=1.0, z=1.0, d=1.0, etiqueta="y",
                   bl=None, revest=None, tema=None):
  """Sección transversal de un canal o tubería, en capas (ver _Escena)."""
  T = tema or TEMA_OSCURO
  fantasma = y is None
  if fantasma:
    tipo, y, b, z, d, bl, revest = "Trapezoidal", 1.2, 2.0, 1.0, 0.0, None, None
  E = _Escena(W, H, T)
  L, F = E.bg, E.fg
  L.fondo(*T["fondo"])
  circ = tipo == "Circular"
  abierto = circ and bl is not None
  if tipo == "Rectangular":
    z = 0.0
  if tipo == "Triangular":
    b = 0.0
  r = d / 2.0
  y_agua = min(y, d) if circ else y
  pad_x, pad_top, pad_bot = 64, 38, 46

  if circ:
    alto = y + bl if abierto else d

    def wc(l):
      if abierto and l >= r:
        return r
      return math.sqrt(max(l * (d - l), 0.0))
  else:
    alto = y + bl if bl is not None else y * 1.35

    def wc(l):
      return b / 2 + z * l

  def borde(nivel):
    if circ:
      tope = min(nivel, r) if abierto else min(nivel, d)
      fmax = math.acos(max(-1.0, min(1.0, 1 - tope / r)))
      der = [(r * math.sin(fmax * i / 60), r * (1 - math.cos(fmax * i / 60)))
             for i in range(61)]
      if abierto and nivel > r:
        der.append((r, nivel))
      return [(-x, l) for x, l in reversed(der)] + der
    return [(-wc(nivel), nivel), (-b / 2, 0.0), (b / 2, 0.0), (wc(nivel), nivel)]

  # ---------- tubería circular (conducto cerrado) ----------
  if circ and not abierto:
    esc = min((W - 2 * pad_x) / d, (H - pad_top - pad_bot) / d)

    def X(x):
      return W / 2 + x * esc

    def Y(l):
      return H - pad_bot - l * esc

    contorno = [(X(x), Y(l)) for x, l in borde(d)]
    L.degradado(contorno, T["tub_int"][0], T["tub_int"][1], Y(d), Y(0))
    if y_agua > 0:
      agua = [(X(x), Y(l)) for x, l in borde(y_agua)]
      mascara = L.degradado(agua, T["agua"][0], T["agua"][1], Y(y_agua), Y(0))
      hw = wc(y_agua)
      E.olas = (mascara, X(-hw), X(hw), Y(y_agua), Y(0) - Y(y_agua))
      _trazo(F.d, F.pts([(X(-hw), Y(y_agua)), (X(hw), Y(y_agua))]), _rgb(T["linea_agua"]), 2.2)
    anillo = F.pts(contorno + contorno[:1])
    _trazo(F.d, anillo, _rgb(T["tub_anillo"][0]), 11)
    _trazo(F.d, anillo, _rgb(T["tub_anillo"][1]), 2.2)
    F.cota((X(0), Y(0) - 2), (X(0), Y(y_agua) + 2), T["cota"])
    E.pill(X(0) + 14, (Y(0) + Y(y_agua)) / 2, f"{etiqueta} = {y:.3f} m", negrita=True, tam=13)
    ym = Y(0) + 24
    F.cota((X(-r), ym), (X(r), ym), T["cota2"])
    E.pill(X(0), ym, f"D = {d:.2f} m", anchor="center")
    return E

  # ---------- canales abiertos ----------
  w_top = wc(alto)
  ext = 0.30 * w_top + 0.12 * alto
  th = 0.24 * alto
  xo = w_top + ext
  esc = min((W - 2 * pad_x) / (2 * xo), (H - pad_top - pad_bot) / (alto + th))
  base = H - pad_bot - th * esc

  def X(x):
    return W / 2 + x * esc

  def Y(l):
    return base - l * esc

  def P(lista):
    return [(X(x), Y(l)) for x, l in lista]

  perfil = borde(alto)
  suelo = [(-xo, alto)] + perfil + [(xo, alto), (xo, -th), (-xo, -th)]
  L.degradado(P(suelo), T["suelo"][0], T["suelo"][1], Y(alto), Y(-th))
  m = 8 / esc
  _textura_suelo(L, T, X, Y, (-xo, xo, -th, alto),
                 lambda x, l: l < 0 or abs(x) > wc(l) + m)
  _trazo(L.d, L.pts([(X(-xo), Y(-th)), (X(xo), Y(-th))]), _rgb(T["suelo_borde"]), 2.4)
  _pasto(L, T, X(-xo), X(-w_top) - 1, Y(alto))
  _pasto(L, T, X(w_top) + 1, X(xo), Y(alto), semilla=7)

  if y_agua > 0:
    agua = P(borde(y_agua))
    mascara = L.degradado(agua, T["agua"][0], T["agua"][1], Y(y_agua), Y(0))
    hw = wc(y_agua)
    E.olas = (mascara, X(-hw), X(hw), Y(y_agua), Y(0) - Y(y_agua))
    _trazo(F.d, F.pts([(X(-hw), Y(y_agua)), (X(hw), Y(y_agua))]), _rgb(T["linea_agua"]), 2.2)

  paredes = F.pts(P(perfil))
  if revest is True:
    _trazo(F.d, paredes, _rgb(T["concreto"][0]), 10)
    _trazo(F.d, paredes, _rgb(T["concreto"][1]), 2.2)
  else:
    _trazo(F.d, paredes, _rgb(T["pared"]), 3.6)

  if bl is not None:
    _discontinuo(F.d, F.pts([(X(-w_top), Y(alto)), (X(w_top), Y(alto))]), _rgb(T["ambar"]), 2.2, 7, 4)

  xa = X(0)
  F.cota((xa, Y(0) - 2), (xa, Y(y_agua) + 2), T["cota"])
  E.pill(xa + 14, (Y(0) + Y(y_agua)) / 2, f"{etiqueta} = {y:.3f} m", negrita=True, tam=13)
  if bl is not None:
    F.cota((xa, Y(y_agua) - 2), (xa, Y(alto) + 2), T["ambar"])
    E.pill(xa - 14, (Y(y_agua) + Y(alto)) / 2, f"BL = {bl:.2f} m", anchor="e",
           negrita=True, color=T["ambar"], borde=T["ambar_borde"])
    if revest is not None:
      E.pill(16, 18, "Canal revestido" if revest else "Canal en tierra", anchor="w",
             tam=11, color=T["muted"])
  if abierto:
    ym = Y(-th / 2)
    F.cota((X(-r), ym), (X(r), ym), T["cota2"])
    E.pill(X(0), ym, f"D = {d:.2f} m", anchor="center")
  elif not circ and b > 0:
    ym = Y(-th / 2)
    F.cota((X(-b / 2), ym), (X(b / 2), ym), T["cota2"])
    E.pill(X(0), ym, f"b = {b:.2f} m", anchor="center")

  if fantasma:
    E.olas = None
    capa, dc = F.capa()
    dc.rectangle([0, 0, capa.size[0], capa.size[1]], fill=T["veil"] + (205,))
    F.componer(capa)
    E.pill(W / 2, H / 2, "La sección transversal aparecerá aquí", anchor="center",
           tam=14, color=T["muted"])
  return E


def escena_compuesta(W, H, y, b, z, h, Bi, Bd, zf, etiqueta="y", tipo="Trapezoidal", tema=None):
  """Canal principal (cualquier forma) con planicies de inundación, en capas."""
  T = tema or TEMA_OSCURO
  E = _Escena(W, H, T)
  L, F = E.bg, E.fg
  L.fondo(*T["fondo"])

  def wc(l):
    return _semiancho_canal(tipo, b, z, h, l)

  def borde_canal(nivel):
    if tipo == "Semicircular":
      tope = min(nivel, h)
      fmax = math.acos(max(-1.0, min(1.0, 1 - tope / h)))
      der = [(h * math.sin(fmax * i / 60), h * (1 - math.cos(fmax * i / 60)))
             for i in range(61)]
      return [(-x, l) for x, l in reversed(der)] + der
    if tipo == "Triangular":
      return [(-z * nivel, nivel), (0.0, 0.0), (z * nivel, nivel)]
    return [(-wc(nivel), nivel), (-b / 2, 0.0), (b / 2, 0.0), (wc(nivel), nivel)]

  Hd = max(y, h) * 1.25
  xc = wc(h)
  xl, xr = -(xc + Bi), xc + Bd
  dz = zf * (Hd - h)
  th = 0.2 * Hd
  pad_x, pad_top, pad_bot = 40, 38, 46
  ancho = (xr + dz) - (xl - dz)
  esc = min((W - 2 * pad_x) / ancho, (H - pad_top - pad_bot) / (Hd + th))
  # si la sección es muy plana se exagera la escala vertical para que se vea
  esc_max_y = (H - pad_top - pad_bot) / (Hd + th)
  factor = min(3.0, esc_max_y / esc)
  if factor < 1.25:
    factor = 1.0
  esc_y = esc * factor
  base = H - pad_bot - th * esc_y
  cx = (xl + xr) / 2

  def X(x):
    return W / 2 + (x - cx) * esc

  def Y(l):
    return base - l * esc_y

  def P(lista):
    return [(X(x), Y(l)) for x, l in lista]

  canal_h = borde_canal(h)
  perfil = [(xl - dz, Hd), (xl, h)] + canal_h + [(xr, h), (xr + dz, Hd)]
  suelo = perfil + [(xr + dz, -th), (xl - dz, -th)]
  L.degradado(P(suelo), T["suelo"][0], T["suelo"][1], Y(Hd), Y(-th))
  m = 8 / esc

  def en_suelo(x, l):
    if l < 0:
      return True
    if l <= h:
      return abs(x) > wc(l) + m
    if x >= 0:
      return x > xr + zf * (l - h) + m
    return x < xl - zf * (l - h) - m

  _textura_suelo(L, T, X, Y, (xl - dz, xr + dz, -th, Hd), en_suelo, n=320)
  _trazo(L.d, L.pts([(X(xl - dz), Y(-th)), (X(xr + dz), Y(-th))]), _rgb(T["suelo_borde"]), 2.4)

  if y <= h:
    region = P(borde_canal(y))
    hw = wc(y)
    sup = (-hw, hw)
  else:
    ext = zf * (y - h)
    region = P(canal_h + [(xr, h), (xr + ext, y), (xl - ext, y), (xl, h)])
    sup = (xl - ext, xr + ext)
  mascara = L.degradado(region, T["agua"][0], T["agua"][1], Y(y), Y(0))
  E.olas = (mascara, X(sup[0]), X(sup[1]), Y(y), Y(0) - Y(y))
  _trazo(F.d, F.pts([(X(sup[0]), Y(y)), (X(sup[1]), Y(y))]), _rgb(T["linea_agua"]), 2.2)
  if y > h:
    for xi in (-xc, xc):
      _discontinuo(F.d, F.pts([(X(xi), Y(h)), (X(xi), Y(y))]), _rgb(T["cota"], 200), 1.6, 5, 4)

  _trazo(F.d, F.pts(P(perfil)), _rgb(T["pared"]), 3.6)
  _pasto(F, T, X(xl), X(-xc) - 1, Y(h))
  _pasto(F, T, X(xc) + 1, X(xr), Y(h), semilla=9)

  xa = X(0)
  F.cota((xa, Y(0) - 2), (xa, Y(y) + 2), T["cota"])
  E.pill(xa + 14, (Y(0) + Y(y)) / 2, f"{etiqueta} = {y:.3f} m", negrita=True, tam=13)
  texto_h = f"r = {h:.2f} m" if tipo == "Semicircular" else f"h = {h:.2f} m"
  E.pill(X(xl) + 10, Y(h) + 22, texto_h, tam=11)
  E.pill(X(xl) + 10, Y(h) + 44, f"Bi = {Bi:.2f} m", tam=11)
  E.pill(X(xr) - 10, Y(h) + 22, f"Bd = {Bd:.2f} m", anchor="e", tam=11)
  if factor > 1.0:
    E.pill(16, 18, f"Escala vertical exagerada ×{factor:.1f}", anchor="w", tam=11,
           color=T["muted"])
  return E


def render_seccion(*a, **k):
  return escena_seccion(*a, **k).fotograma(0.0)


def render_compuesta(*a, **k):
  return escena_compuesta(*a, **k).fotograma(0.0)


ESCENA = {dibujar_seccion: escena_seccion, dibujar_compuesta: escena_compuesta}
RENDER = {dibujar_seccion: render_seccion, dibujar_compuesta: render_compuesta}


class _IconoLienzo:
  """Imita el subconjunto de Canvas que usa icono(), pero dibuja con Pillow (suavizado)."""

  def __init__(self, w=84, h=56, ss=4):
    self.w, self.h, self.ss = w, h, ss
    self.img = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
    self.d = ImageDraw.Draw(self.img)

  def delete(self, *a):
    pass

  def _p(self, coords):
    c = list(coords)
    return [(c[i] * self.ss, c[i + 1] * self.ss) for i in range(0, len(c), 2)]

  def create_polygon(self, *coords, fill="", outline="", **k):
    if fill:
      self.d.polygon(self._p(coords), fill=_rgb(fill))

  def _linea(self, p, fill, width, dash, arrow):
    col = _rgb(fill)
    if dash:
      _discontinuo(self.d, p, col, width, dash[0], dash[1], self.ss)
    else:
      _trazo(self.d, p, col, width, True, self.ss)
    if arrow == "last" and len(p) > 1:
      _punta(self.d, p[-2], p[-1], col, 4.5, self.ss)

  def create_line(self, *coords, fill="black", width=1, dash=(), smooth=False,
                  arrow=None, **k):
    p = self._p(coords)
    if smooth:
      p = _chaikin(p)
    self._linea(p, fill, width, dash, arrow)

  def create_arc(self, x0, y0, x1, y1, start=0, extent=90, style="arc", outline="black",
                 width=1, dash=(), **k):
    cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, abs(x1 - x0) / 2, abs(y1 - y0) / 2
    p = []
    for i in range(61):
      a = math.radians(start + extent * i / 60)
      p.append(((cx + rx * math.cos(a)) * self.ss, (cy - ry * math.sin(a)) * self.ss))
    self._linea(p, outline, width, dash, None)

  def imagen(self):
    return self.img.resize((self.w, self.h), Image.LANCZOS)


def render_icono(kind):
  lz = _IconoLienzo()
  icono(lz, kind)
  return lz.imagen()


def render_logo(px):
  """Cuadrado redondeado de agua con tres olas."""
  L = _Lienzo(px, px, transparente=True)
  L.degradado([(0, 0), (px, 0), (px, px), (0, px)], "#2FB3CC", "#14677B", 0, px)
  capa, dc = L.capa()
  for k, (yy, alfa) in enumerate(((0.36, 255), (0.55, 190), (0.74, 120))):
    puntos = [(x * SS, (px * yy + px * 0.07 * math.sin(x / px * 2 * math.pi * 1.5 + k)) * SS)
              for x in [i * px / 40 for i in range(41)]]
    _trazo(dc, puntos, (255, 255, 255, alfa), px * 0.07)
  L.componer(capa)
  return L.final(redondeo=px * 0.24)


ALTO_BANNER = 104
_MULT = (1, -1, 1, -1, 2, -2)


def _rio(L, W, H, fase=0.0, y_ini=0.50, paso=0.085):
  """Capas de olas translúcidas; con `fase` de 0 a 1 la animación se repite sin saltos."""
  capa, dc = L.capa()
  for k in range(6):
    y0 = H * (y_ini + paso * k)
    amp = H * (0.030 + 0.004 * k)
    lam = W / (1.3 + 0.55 * k)
    ph = k * 1.3 + 2 * math.pi * fase * _MULT[k]
    puntos, x = [], 0
    while x <= W + 4:
      puntos.append((x * SS, (y0 + amp * math.sin(x / lam * 2 * math.pi + ph)) * SS))
      x += 4
    dc.polygon(puntos + [(W * SS, H * SS), (0, H * SS)], fill=(150, 225, 240, 20 + 11 * k))
    _trazo(dc, puntos, (255, 255, 255, 48 + 12 * k), 1.5, redondo=False)
  L.componer(capa)


def _envolver(d, texto, fuente, ancho):
  """Parte el texto en líneas que caben en `ancho` píxeles."""
  lineas, actual = [], ""
  for palabra in texto.split():
    prueba = (actual + " " + palabra).strip()
    if not actual or d.textlength(prueba, font=fuente) <= ancho:
      actual = prueba
    else:
      lineas.append(actual)
      actual = palabra
  if actual:
    lineas.append(actual)
  return lineas


def _texto_espaciado(d, x, y, texto, fuente, color, sep, centro=None):
  anchos = [d.textlength(c, font=fuente) for c in texto]
  total = sum(anchos) + sep * (len(texto) - 1)
  if centro is not None:
    x = centro - total / 2
  for c, a in zip(texto, anchos):
    d.text((x, y), c, font=fuente, fill=color)
    x += a + sep


def render_hero(W, H, fase=0.0):
  """Portada: río de capas translúcidas, un canal dibujado en línea y el nombre."""
  L = _Lienzo(W, H, transparente=True)
  L.degradado([(0, 0), (W, 0), (W, H), (0, H)], "#08141E", "#15667C", 0, H)
  _rio(L, W, H, fase)
  capa, dc = L.capa()
  cx, base_y, alto_c = W - 170, H * 0.80, H * 0.50
  sup = [(cx - 110, base_y - alto_c), (cx - 52, base_y), (cx + 52, base_y), (cx + 110, base_y - alto_c)]
  _trazo(dc, [(x * SS, y * SS) for x, y in sup], (255, 255, 255, 170), 2.4)
  nivel = base_y - alto_c * (0.62 + 0.03 * math.sin(2 * math.pi * fase))
  _discontinuo(dc, [((cx - 74) * SS, nivel * SS), ((cx + 74) * SS, nivel * SS)],
               (255, 255, 255, 200), 1.8, 6, 4)
  xa = cx + 128
  _trazo(dc, [(xa * SS, base_y * SS), (xa * SS, (base_y - alto_c) * SS)], (255, 255, 255, 120), 1.4, redondo=False)
  _punta(dc, (xa * SS, base_y * SS), (xa * SS, (base_y - alto_c) * SS), (255, 255, 255, 150))
  _punta(dc, (xa * SS, (base_y - alto_c) * SS), (xa * SS, base_y * SS), (255, 255, 255, 150))
  L.componer(capa)
  fm = _fuente(int(min(52, H * 0.31)) * SS, marca=True)
  _texto_espaciado(L.d, 34 * SS, int(H * 0.17) * SS, "EL CAUDALOSO", fm, (255, 255, 255, 255), 4 * SS)
  L.d.text((36 * SS, int(H * 0.58) * SS), "Hidráulica de canales abiertos",
           font=_fuente(17 * SS), fill=(205, 235, 242, 255))
  L.d.text((36 * SS, int(H * 0.58 + 26) * SS),
           "Tirante normal y crítico, secciones óptimas y compuestas, rugosidad y borde libre.",
           font=_fuente(12 * SS), fill=(160, 205, 217, 255))
  return L.final(redondeo=14)


def render_banner(W, H, titulo, desc, kind, c1, c2):
  """Encabezado de cada módulo: degradado del grupo, olas, ícono, título y descripción."""
  L = _Lienzo(W, H, transparente=True)
  L.degradado([(0, 0), (W, 0), (W, H), (0, H)], c1, c2, 0, H)
  _rio(L, W, H, 0.0, y_ini=0.60, paso=0.07)
  x0, tw, th = 22, 108, 70
  y0 = (H - th) / 2
  capa, dc = L.capa()
  dc.rounded_rectangle([x0 * SS, y0 * SS, (x0 + tw) * SS, (y0 + th) * SS],
                       radius=14 * SS, fill=(8, 18, 28, 150),
                       outline=(255, 255, 255, 70), width=SS)
  L.componer(capa)
  ic = render_icono(kind).resize((84 * SS, 56 * SS), Image.LANCZOS)
  L.img.paste(ic, (int((x0 + (tw - 84) / 2) * SS), int((y0 + (th - 56) / 2) * SS)), ic)
  L.d = ImageDraw.Draw(L.img)
  tx = x0 + tw + 22
  ty = int(H * 0.16)
  L.d.text((tx * SS, ty * SS), titulo, font=_fuente(27 * SS, negrita=True), fill=(255, 255, 255, 255))
  fd = _fuente(13 * SS)
  for i, linea in enumerate(_envolver(L.d, desc, fd, (W - tx - 26) * SS)[:2]):
    L.d.text((tx * SS, (ty + 40 + i * 19) * SS), linea, font=fd, fill=(214, 237, 244, 255))
  return L.final(redondeo=14)


def render_splash(W, H):
  """Pantalla de inicio del programa."""
  L = _Lienzo(W, H, transparente=True)
  L.degradado([(0, 0), (W, 0), (W, H), (0, H)], "#0A1C2B", "#1A7F96", 0, H)
  _rio(L, W, H, 0.15, y_ini=0.52, paso=0.085)
  img = L.final(redondeo=20)
  logo = render_logo(84)
  img.paste(logo, ((W - 84) // 2, int(H * 0.12)), logo)
  d = ImageDraw.Draw(img)
  _texto_espaciado(d, 0, int(H * 0.45), "EL CAUDALOSO", _fuente(44, marca=True),
                   (255, 255, 255, 255), 5, centro=W / 2)
  f = _fuente(16)
  t = "Hidráulica de canales abiertos"
  d.text(((W - d.textlength(t, font=f)) / 2, int(H * 0.64)), t, font=f, fill=(205, 235, 242, 255))
  f2 = _fuente(12)
  t2 = f"Versión {VERSION}   Cargando…"
  d.text(((W - d.textlength(t2, font=f2)) / 2, int(H * 0.83)), t2, font=f2, fill=(160, 205, 217, 255))
  return img


def render_informe(titulo, descripcion, entradas, filas, nota, dibujo):
  """Memoria de cálculo en una hoja A4 (150 ppp) lista para PDF o PNG."""
  INK, MUTED, WATER_DK, WATER, LINE = "#12283A", "#5F7385", "#17758A", "#2A9DB5", "#CFDAE1"
  W, M = 1240, 70
  ancho = W - 2 * M
  img = Image.new("RGB", (W, 2400), "#FFFFFF")
  d = ImageDraw.Draw(img)

  def f(px, neg=False):
    return _fuente(px, neg)

  # cabecera
  L = _Lienzo(W, 150)
  L.degradado([(0, 0), (W, 0), (W, 150), (0, 150)], "#0E2436", "#1A7F96", 0, 150)
  _rio(L, W, 150, 0.0, y_ini=0.55, paso=0.09)
  img.paste(L.final(), (0, 0))
  logo = render_logo(76)
  img.paste(logo, (M, 37), logo)
  _texto_espaciado(d, M + 96, 38, "EL CAUDALOSO", _fuente(38, marca=True), "#FFFFFF", 3)
  d.text((M + 98, 90), "Memoria de cálculo", font=f(20), fill="#CDEAF1")
  fecha = datetime.now().strftime("%d/%m/%Y  %H:%M")
  d.text((W - M - d.textlength(fecha, font=f(18)), 62), fecha, font=f(18), fill="#CDEAF1")

  y = 196
  d.text((M, y), titulo, font=f(38, True), fill=INK)
  y += 56
  for linea in _envolver(d, descripcion, f(17), ancho)[:2]:
    d.text((M, y), linea, font=f(17), fill=MUTED)
    y += 26
  y += 14

  def seccion(y, texto):
    d.text((M, y), texto, font=f(22, True), fill=WATER_DK)
    d.line([(M, y + 36), (W - M, y + 36)], fill=LINE, width=2)
    return y + 52

  def celdas(y, items, columnas=3):
    cw = (ancho - 16 * (columnas - 1)) / columnas
    alto_c = 62
    for i, (et, val, uni) in enumerate(items):
      cx = M + (i % columnas) * (cw + 16)
      cy = y + (i // columnas) * (alto_c + 12)
      d.rounded_rectangle([cx, cy, cx + cw, cy + alto_c], radius=10, fill="#F6F9FB", outline="#D5DFE6")
      d.text((cx + 14, cy + 8), et, font=f(14), fill=MUTED)
      d.text((cx + 14, cy + 28), val, font=f(20, True), fill=INK)
      if uni:
        d.text((cx + 18 + d.textlength(val, font=f(20, True)), cy + 34), uni, font=f(14), fill=MUTED)
    filas_n = (len(items) + columnas - 1) // columnas
    return y + filas_n * (alto_c + 12)

  y = seccion(y, "Datos de entrada")
  y = celdas(y, entradas) + 14

  if dibujo is not None:
    fn, kw = dibujo
    y = seccion(y, "Sección transversal")
    base_w = 760
    grafico = ESCENA[fn](base_w, int(360 * base_w / ancho), tema=TEMA_CLARO, **kw).fotograma(0.0)
    grafico = grafico.resize((ancho, 360), Image.LANCZOS)
    img.paste(grafico, (M, y))
    d.rectangle([M, y, M + ancho, y + 360], outline="#D5DFE6", width=2)
    y += 360 + 22

  y = seccion(y, "Resultados")
  et, val, uni = filas[0]
  d.rounded_rectangle([M, y, W - M, y + 100], radius=12, fill="#EAF6F8")
  d.rectangle([M, y + 6, M + 7, y + 94], fill=WATER)
  d.text((M + 28, y + 14), et, font=f(17), fill=MUTED)
  d.text((M + 28, y + 42), val, font=f(40, True), fill=WATER_DK)
  if uni:
    d.text((M + 36 + d.textlength(val, font=f(40, True)), y + 62), uni, font=f(22), fill=MUTED)
  y += 100 + 16
  y = celdas(y, filas[1:])
  if nota:
    y += 8
    for linea in _envolver(d, nota, f(16), ancho)[:3]:
      d.text((M, y), linea, font=f(16), fill=MUTED)
      y += 24

  alto = max(1754, y + 110)
  pie_y = alto - 62
  d.line([(M, pie_y), (W - M, pie_y)], fill=LINE, width=2)
  d.text((M, pie_y + 14), "EL CAUDALOSO, hidráulica de canales abiertos", font=f(14), fill=MUTED)
  t = "Escuela Profesional de Ingeniería Civil, UNCP"
  d.text((W - M - d.textlength(t, font=f(14)), pie_y + 14), t, font=f(14), fill=MUTED)
  return img.crop((0, 0, W, alto))


VERSION = "1.0"
ACENTO_BASE = ("#0B1A26", "#15677D", "#2FB3CC")
GRUPOS = {
    "Tirantes y caudales": ACENTO_BASE,
    "Diseño de secciones": ("#101B3C", "#2D4A9E", "#6B8CF2"),
    "Flujo variado": ("#092826", "#1B7F62", "#3CC79B"),
}


def carpeta_datos():
  """Carpeta del usuario donde se guardan el historial y las preferencias."""
  base = os.environ.get("APPDATA") or os.path.join(os.path.expanduser("~"), ".config")
  ruta = os.path.join(base, "EL CAUDALOSO")
  try:
    os.makedirs(ruta, exist_ok=True)
  except OSError:
    ruta = os.path.expanduser("~")
  return ruta


class Almacen:
  """Historial de cálculos y tamaño de ventana, guardados en un archivo JSON."""
  MAX = 40

  def __init__(self):
    self.carpeta = carpeta_datos()
    self.ruta = os.path.join(self.carpeta, "datos.json")
    self.datos = {"historial": [], "ventana": None}
    try:
      with open(self.ruta, encoding="utf-8") as f:
        leido = json.load(f)
      if isinstance(leido, dict):
        self.datos.update(leido)
    except (OSError, ValueError):
      pass
    if not isinstance(self.datos.get("historial"), list):
      self.datos["historial"] = []

  def guardar(self):
    try:
      with open(self.ruta, "w", encoding="utf-8") as f:
        json.dump(self.datos, f, ensure_ascii=False, indent=1)
    except OSError:
      pass

  def registrar(self, entrada):
    h = self.datos["historial"]
    if h and all(h[0].get(k) == entrada[k] for k in ("clave", "vars", "sels")):
      h[0]["t"], h[0]["resumen"] = entrada["t"], entrada["resumen"]
    else:
      h.insert(0, entrada)
      del h[self.MAX:]
    self.guardar()

  def borrar(self):
    self.datos["historial"] = []
    self.guardar()


# ======================================================================
# ESTILOS TTK
# ======================================================================
def configurar_estilos(root):
  global ESTILO_SCROLL
  st = ttk.Style(root)
  st.theme_use("clam")
  st.configure(".", font=fnt(10))
  st.configure(
      "TEntry", fieldbackground=FIELD, foreground=INK, insertcolor=INK, bordercolor=LINE,
      lightcolor=LINE, darkcolor=LINE, padding=(8, 6),
  )
  st.map(
      "TEntry",
      bordercolor=[("focus", WATER)], lightcolor=[("focus", WATER)],
      darkcolor=[("focus", WATER)],
      fieldbackground=[("disabled", "#0B151E")],
      foreground=[("disabled", DISABLED)],
  )
  st.configure(
      "TCombobox", fieldbackground=FIELD, background=SURFACE2, foreground=INK,
      bordercolor=LINE, lightcolor=LINE, darkcolor=LINE, arrowcolor=INK,
      insertcolor=INK, padding=(8, 6),
  )
  st.map(
      "TCombobox",
      fieldbackground=[("readonly", FIELD)],
      selectbackground=[("readonly", FIELD)],
      selectforeground=[("readonly", INK)],
      background=[("active", HOVER)],
      bordercolor=[("focus", WATER)],
      foreground=[("disabled", DISABLED)],
  )
  st.configure(
      "Primary.TButton", background=BTN, foreground="#FFFFFF",
      borderwidth=0, focusthickness=0, padding=(18, 11), font=fnt(11, "bold"),
  )
  st.map("Primary.TButton", background=[("pressed", BTN_PRESS), ("active", BTN_HOVER)])
  st.configure(
      "Ghost.TButton", background=SURFACE2, foreground=INK, bordercolor=LINE,
      lightcolor=SURFACE2, darkcolor=SURFACE2, padding=(10, 4), font=fnt(9),
  )
  st.map("Ghost.TButton", background=[("active", "#24405A")])
  try:  # barra de desplazamiento fina y sin flechas
    st.layout("Slim.Vertical.TScrollbar", [
        ("Vertical.Scrollbar.trough", {
            "sticky": "ns",
            "children": [("Vertical.Scrollbar.thumb",
                          {"expand": "1", "sticky": "nswe"})],
        })
    ])
    st.configure("Slim.Vertical.TScrollbar", troughcolor=BG, background="#2C4760",
                 bordercolor=BG, lightcolor="#2C4760", darkcolor="#2C4760",
                 width=10, relief="flat")
    st.map("Slim.Vertical.TScrollbar", background=[("active", "#456482")])
    ESTILO_SCROLL = "Slim.Vertical.TScrollbar"
  except tk.TclError:
    ESTILO_SCROLL = "Vertical.TScrollbar"
  root.option_add("*TCombobox*Listbox.font", f"{{{FAMILIA}}} 10")
  root.option_add("*TCombobox*Listbox.background", FIELD)
  root.option_add("*TCombobox*Listbox.foreground", INK)
  root.option_add("*TCombobox*Listbox.selectBackground", BTN)
  root.option_add("*TCombobox*Listbox.selectForeground", "#FFFFFF")


def tarjeta(parent):
  return tk.Frame(parent, bg=SURFACE, highlightthickness=1, highlightbackground=LINE)


def _ease(t):
  """Curva de aceleración suave (rápida al inicio, lenta al final)."""
  t = max(0.0, min(1.0, t))
  return 1 - (1 - t) ** 3


class Animador:
  """Transiciones suaves de color, números y cortinas para widgets de Tk."""

  def __init__(self, root):
    self.root = root
    self._t = {}

  def _hex(self, w, valor):
    if isinstance(valor, str) and valor.startswith("#") and len(valor) == 7:
      return valor
    if not isinstance(valor, str):
      return "#000000"
    r, g, b = w.winfo_rgb(valor)
    return "#%02x%02x%02x" % (r >> 8, g >> 8, b >> 8)

  def _cancelar(self, clave):
    t = self._t.pop(clave, None)
    if t is not None:
      try:
        self.root.after_cancel(t)
      except tk.TclError:
        pass

  def color(self, w, opcion, destino, ms=150, retraso=0):
    """Cambia una opción de color (bg, fg, ...) de forma gradual."""
    clave = (str(w), opcion)
    self._cancelar(clave)
    pasos = max(3, ms // 16)

    def paso(i, origen):
      try:
        w.config(**{opcion: _mezcla(origen, destino, _ease(i / pasos))})
      except tk.TclError:
        return
      if i < pasos:
        self._t[clave] = self.root.after(max(1, ms // pasos), paso, i + 1, origen)
      else:
        self._t.pop(clave, None)

    def inicio():
      try:
        origen = self._hex(w, w.cget(opcion))
      except tk.TclError:
        return
      paso(1, origen)

    if retraso > 0:
      self._t[clave] = self.root.after(retraso, inicio)
    else:
      inicio()

  def numero(self, w, texto, ms=650):
    """Hace subir un número desde cero hasta `texto` (mismos decimales)."""
    clave = (str(w), "text")
    self._cancelar(clave)
    try:
      destino = float(texto)
    except ValueError:
      w.config(text=texto)
      return
    dec = len(texto.split(".")[1]) if "." in texto else 0
    pasos = max(4, ms // 16)

    def paso(i):
      try:
        w.config(text=texto if i >= pasos else f"{destino * _ease(i / pasos):.{dec}f}")
      except tk.TclError:
        return
      if i < pasos:
        self._t[clave] = self.root.after(max(1, ms // pasos), paso, i + 1)
      else:
        self._t.pop(clave, None)

    paso(0)

  def cortina(self, parent, color, ms=300):
    """Cubre `parent` y se retira de arriba hacia abajo, revelando la pantalla nueva."""
    c = tk.Frame(parent, bg=color)
    c.place(x=0, rely=1.0, anchor="sw", relwidth=1.0, relheight=1.0)
    pasos = max(4, ms // 16)

    def paso(i):
      try:
        if i >= pasos:
          c.destroy()
          return
        c.place_configure(relheight=1.0 - _ease(i / pasos))
      except tk.TclError:
        return
      self.root.after(max(1, ms // pasos), paso, i + 1)

    paso(1)
    return c

  def entrada(self, root, ms=280):
    """Aparición gradual de la ventana principal (donde el sistema lo permite)."""
    pasos = max(4, ms // 16)

    def paso(i):
      try:
        root.attributes("-alpha", min(1.0, _ease(i / pasos)))
      except tk.TclError:
        return
      if i < pasos:
        root.after(max(1, ms // pasos), paso, i + 1)

    paso(1)


class ErrorCampo(ValueError):
  """Error de un dato; `clave` indica el campo (o '_rug', '_bl') para llevar al usuario a él."""

  def __init__(self, mensaje, clave=None):
    super().__init__(mensaje)
    self.clave = clave


class MarcoDesplazable(tk.Frame):
  """Contenedor con desplazamiento vertical (rueda del mouse y barra fina)."""

  def __init__(self, parent, bg=BG):
    super().__init__(parent, bg=bg)
    self.cv = tk.Canvas(self, bg=bg, highlightthickness=0)
    try:
      self.sb = ttk.Scrollbar(self, orient="vertical", command=self.cv.yview,
                              style=ESTILO_SCROLL)
    except tk.TclError:
      self.sb = ttk.Scrollbar(self, orient="vertical", command=self.cv.yview)
    self.cv.configure(yscrollcommand=self._fijar_barra)
    self.cv.pack(side="left", fill="both", expand=True)
    self.interior = tk.Frame(self.cv, bg=bg)
    self._ventana = self.cv.create_window((0, 0), window=self.interior, anchor="nw")
    self.interior.bind("<Configure>", self._al_cambiar_interior)
    self.cv.bind("<Configure>", self._al_cambiar_canvas)

  def _al_cambiar_interior(self, e):
    self.cv.configure(scrollregion=self.cv.bbox("all"))

  def _al_cambiar_canvas(self, e):
    self.cv.itemconfigure(self._ventana, width=e.width)

  def _fijar_barra(self, a, b):
    """La barra solo aparece cuando el contenido no cabe."""
    if float(a) <= 0.0 and float(b) >= 1.0:
      self.sb.pack_forget()
    elif not self.sb.winfo_ismapped():
      self.sb.pack(side="right", fill="y", before=self.cv)
    self.sb.set(a, b)

  def rueda(self, e):
    if self.interior.winfo_reqheight() <= self.cv.winfo_height():
      return
    if getattr(e, "num", None) == 4:
      paso = -1
    elif getattr(e, "num", None) == 5:
      paso = 1
    else:
      paso = -1 if e.delta > 0 else 1
    self.cv.yview_scroll(paso * 2, "units")


# ======================================================================
# ======================================================================
# RUGOSIDAD: MODOS Y DIÁLOGO DE COWAN
# ======================================================================
RUG_MODOS = ["Valor único", "Cowan", "Compuesta (Horton-Einstein)"]

RUG_DEFECTO = {
    "simples": ["n"],
    "horton": [("nf", "n del fondo", "0.015"),
               ("ni", "n del lado izquierdo", "0.020"),
               ("nd", "n del lado derecho", "0.030")],
    "boton_unico": True,
}

# ---------- Borde libre según Villón (Hidráulica de canales, p. 139) ----------
BL_MODOS = [
    "No incluir",
    "Canal en tierra: y/3 (Villón)",
    "Canal revestido: y/5 (Villón)",
    "Según el caudal (Villón)",
    "Según el ancho de solera (Villón)",
]
# (ancho de solera máximo del rango en m, BL en m)
BL_SOLERA = [(0.80, 0.40), (1.50, 0.50), (3.00, 0.60), (20.00, 1.00)]


def borde_libre_villon(modo, Q, b, y):
  """Devuelve (BL en m, revestido) con los criterios de Villón.

  revestido es True/False cuando el criterio distingue el tipo de canal y None
  cuando no lo distingue (caudal y ancho de solera).
  """
  if modo == BL_MODOS[1]:
    return y / 3.0, False
  if modo == BL_MODOS[2]:
    return y / 5.0, True
  if modo == BL_MODOS[3]:
    return (0.30 if Q < 0.5 else 0.40), None
  if modo == BL_MODOS[4]:
    if b <= 0:
      raise ValueError(
          "El criterio por ancho de solera necesita una solera (b mayor que "
          "cero). En esta sección use otro criterio."
      )
    for b_max, bl in BL_SOLERA:
      if b <= b_max:
        return bl, None
    return BL_SOLERA[-1][1], None
  raise ValueError("Criterio de borde libre desconocido.")


COWAN_ETIQUETAS = [
    ("n0", "Material del cauce (n0)"),
    ("n1", "Grado de irregularidad (n1)"),
    ("n2", "Variación de la sección (n2)"),
    ("n3", "Efecto de obstrucciones (n3)"),
    ("n4", "Vegetación (n4)"),
    ("m5", "Grado de sinuosidad (m5)"),
]


def cowan_estado_inicial():
  est = {k: list(COWAN_OPC[k])[0] for k, _ in COWAN_ETIQUETAS}
  est["t"] = "0.5"
  return est


def cowan_n(est):
  """n = (n0 + n1 + n2 + n3 + n4) · m5 con las opciones elegidas."""
  try:
    t = float(str(est["t"]).replace(",", "."))
  except ValueError:
    raise ValueError("La posición dentro de los rangos debe ser un número entre 0 y 1.")
  if not 0 <= t <= 1:
    raise ValueError("La posición dentro de los rangos debe estar entre 0 y 1.")
  suma = 0.0
  for clave in ("n0", "n1", "n2", "n3", "n4"):
    lo, hi = COWAN_OPC[clave][est[clave]]
    suma += lo + t * (hi - lo)
  return suma * COWAN_OPC["m5"][est["m5"]][0]


class CowanDialog(tk.Toplevel):
  """Ventana para elegir los factores de Cowan; escribe n en el campo `clave`."""

  def __init__(self, ventana, clave):
    super().__init__(ventana)
    self.ventana, self.clave = ventana, clave
    self.title("Rugosidad de Cowan")
    self.configure(bg=BG)
    self.resizable(False, False)
    self.transient(ventana.winfo_toplevel())
    self.geometry(f"+{ventana.winfo_rootx() + 60}+{ventana.winfo_rooty() + 20}")
    estado = ventana.cowan_estados.setdefault(clave, cowan_estado_inicial())
    self.vars = {}

    tk.Frame(self, bg=WATER, height=4).pack(fill="x")
    caja = tarjeta(self)
    caja.pack(fill="both", expand=True, padx=20, pady=20)
    f = tk.Frame(caja, bg=SURFACE)
    f.pack(padx=20, pady=18)
    tk.Label(f, text="Factores de Cowan", bg=SURFACE, fg=INK,
             font=fnt(13, "bold")).pack(anchor="w")
    tk.Label(f, text="n = (n0 + n1 + n2 + n3 + n4) × m5", bg=SURFACE, fg=MUTED,
             font=fnt(9)).pack(anchor="w", pady=(0, 10))
    for k, etiqueta in COWAN_ETIQUETAS:
      tk.Label(f, text=etiqueta, bg=SURFACE, fg=MUTED, font=fnt(9)).pack(anchor="w")
      var = tk.StringVar(value=estado[k])
      cb = ttk.Combobox(f, textvariable=var, values=list(COWAN_OPC[k]),
                        state="readonly", width=34)
      cb.pack(fill="x", pady=(2, 8))
      cb.bind("<<ComboboxSelected>>", lambda e, c=cb: (c.selection_clear(), self._previa()))
      self.vars[k] = var
    tk.Label(f, text="Posición dentro de los rangos (0 a 1)", bg=SURFACE, fg=MUTED,
             font=fnt(9)).pack(anchor="w")
    self.vars["t"] = tk.StringVar(value=estado["t"])
    ent = ttk.Entry(f, textvariable=self.vars["t"], width=10, justify="right")
    ent.pack(anchor="w", pady=(2, 10))
    ent.bind("<KeyRelease>", lambda e: self._previa())
    self.lbl_n = tk.Label(f, text="", bg=SURFACE, fg=WATER_DK, font=fnt(20, "bold"))
    self.lbl_n.pack(anchor="w")
    self.lbl_err = tk.Label(f, text="", bg=SURFACE, fg=DANGER, font=fnt(9),
                            wraplength=330, justify="left", anchor="w")
    self.lbl_err.pack(fill="x")
    botones = tk.Frame(f, bg=SURFACE)
    botones.pack(fill="x", pady=(10, 0))
    ttk.Button(botones, text="Usar este valor", style="Primary.TButton",
               cursor="hand2", command=self._aplicar).pack(side="right")
    ttk.Button(botones, text="Cancelar", style="Ghost.TButton",
               cursor="hand2", command=self.destroy).pack(side="right", padx=(0, 8))
    self.bind("<Escape>", lambda e: self.destroy())
    self._previa()
    self.wait_visibility()
    self.grab_set()

  def _estado(self):
    return {k: v.get() for k, v in self.vars.items()}

  def _previa(self):
    try:
      n = cowan_n(self._estado())
    except ValueError as e:
      self.lbl_n.config(text="")
      self.lbl_err.config(text=str(e))
      return None
    self.lbl_n.config(text=f"n = {n:.4f}")
    self.lbl_err.config(text="")
    return n

  def _aplicar(self):
    n = self._previa()
    if n is None:
      return
    self.ventana.cowan_estados[self.clave] = self._estado()
    self.ventana.vars[self.clave].set(f"{n:.4f}")
    self.destroy()


# ======================================================================
# VENTANA DE MÓDULO (genérica)
# ======================================================================
class Ventana(tk.Frame):
  """Módulo de cálculo: datos a la izquierda (por pestañas), gráfico y resultados a la derecha.

  campos:     [(clave, etiqueta, valor_inicial, unidad[, "cowan"])]
  selectores: [(clave, etiqueta, opciones, valor_inicial)]
  calcular:   función(ventana) -> {"filas": [(etiqueta, valor, unidad)],
                                   "dibujo": {...} | None, "nota": str | None}
  rug:        añade la pestaña Rugosidad (valor único, Cowan o compuesta
              Horton-Einstein).
  rug_activa: función(ventana) -> bool; indica cuándo n es un dato.
  bl:         añade la pestaña Borde libre (criterios de Villón).
  """

  def __init__(self, app, titulo, descripcion, campos, calcular,
               selectores=(), dibujo=False, habilitar=None,
               columnas=1, size=None, rug=False, rug_activa=None,
               rug_cfg=None, bl=False):
    super().__init__(app.pagina.interior, bg=BG)
    self.pack(fill="both", expand=True)
    self.app = app
    app.modulo = self

    self.calcular = calcular
    self.habilitar = habilitar
    self.rug, self.rug_activa = rug, rug_activa
    self.vars, self.entradas, self.lbls = {}, {}, {}
    self.etiquetas, self.sels, self.filas_sel = {}, {}, {}
    self.celdas, self.visibles, self.orden, self.grupo_de = {}, {}, [], {}
    self.paginas, self.tabs = {}, {}
    self.btns_cowan, self.rug_cfg = {}, None
    self.cowan_estados = {}
    self.texto_copiable = ""
    self.cv = None
    self._dibujo = None
    self._cv_w = 0
    self._tarea = None
    self._foto = None
    self.titulo, self.descripcion = titulo, descripcion
    self.estado, self.unidades, self.etq_sel, self._ultimo = {}, {}, {}, None
    self._escena, self._cuadros, self._i, self._anim_id = None, [], 0, None
    self._banner_w, self._banner_tarea, self._banner_foto = 0, None, None

    rug_keys = set()
    if rug:
      cfg = rug_cfg or RUG_DEFECTO
      self.rug_cfg = cfg
      nuevos = []
      for c in campos:
        nuevos.append(c)
        if c[0] == cfg["simples"][-1]:
          nuevos += [(k, e, dflt, "") for k, e, dflt in cfg["horton"]]
          if cfg.get("boton_unico", True):
            nuevos.append(("_cowan", "", "", ""))
      campos = nuevos
      rug_keys = set(cfg["simples"]) | {k for k, _, _ in cfg["horton"]} | {"_cowan"}

    # ---------------- encabezado ----------------
    cab = tk.Frame(self, bg=BG)
    cab.pack(fill="x", padx=28, pady=(24, 14))
    if HAY_PIL:
      marco_b = tk.Frame(cab, bg=BG, height=ALTO_BANNER)
      marco_b.pack(fill="x")
      marco_b.pack_propagate(False)
      self._banner = tk.Label(marco_b, bg=BG, bd=0)
      self._banner.pack(fill="both", expand=True)
      marco_b.bind("<Configure>", self._al_banner)
      self._pintar_banner()
    else:
      tk.Label(cab, text=titulo, bg=BG, fg=INK, font=fnt(20, "bold"),
               anchor="w").pack(fill="x")
      tk.Label(cab, text=descripcion, bg=BG, fg=MUTED, font=fnt(10), anchor="w",
               justify="left", wraplength=760).pack(fill="x", pady=(2, 0))

    cuerpo = tk.Frame(self, bg=BG)
    cuerpo.pack(fill="both", expand=True, padx=28, pady=(0, 28))
    cuerpo.columnconfigure(1, weight=1)
    cuerpo.rowconfigure(0, weight=1)

    # ---------------- panel de datos ----------------
    izq = tarjeta(cuerpo)
    izq.grid(row=0, column=0, sticky="nsew", padx=(0, 18))

    pie = tk.Frame(izq, bg=SURFACE)
    pie.pack(side="bottom", fill="x", padx=20, pady=(0, 18))

    nombres = ["Datos"] + (["Rugosidad"] if rug else []) + (["Borde libre"] if bl else [])
    if len(nombres) > 1:
      barra = tk.Frame(izq, bg=SURFACE)
      barra.pack(side="top", fill="x", padx=12, pady=(10, 0))
      tk.Frame(izq, bg=LINE, height=1).pack(side="top", fill="x")
      for nombre in nombres:
        self._crear_tab(barra, nombre)
    else:
      tk.Label(izq, text="Datos de entrada", bg=SURFACE, fg=INK,
               font=fnt(11, "bold")).pack(side="top", anchor="w", padx=20, pady=(16, 0))

    cont = tk.Frame(izq, bg=SURFACE)
    cont.pack(side="top", fill="both", expand=True, padx=20, pady=(14, 6))
    cont.columnconfigure(0, weight=1)
    cont.rowconfigure(0, weight=1)
    for nombre in nombres:
      pg = tk.Frame(cont, bg=SURFACE)
      pg.grid(row=0, column=0, sticky="nsew")
      self.paginas[nombre] = pg

    pd = self.paginas["Datos"]
    for clave, etiqueta, opciones, inicial in selectores:
      self._selector(pd, clave, etiqueta, opciones, inicial)
    self.g_datos = tk.Frame(pd, bg=SURFACE)
    self.g_datos.pack(fill="x")
    self.g_datos.columnconfigure(0, weight=1)

    if rug:
      pr = self.paginas["Rugosidad"]
      tk.Label(pr, text="Defina cómo se obtiene la rugosidad n del canal.",
               bg=SURFACE, fg=MUTED, font=fnt(9), anchor="w", justify="left",
               wraplength=310).pack(fill="x", pady=(0, 10))
      self._selector(pr, "rug", "Método", RUG_MODOS, RUG_MODOS[0])
      self.info_rug = tk.Label(pr, text="Aquí n es la incógnita: no hace falta definir la rugosidad.",
                               bg=SURFACE, fg=MUTED, font=fnt(10), anchor="w",
                               justify="left", wraplength=310)
      self.g_rug = tk.Frame(pr, bg=SURFACE)
      self.g_rug.pack(fill="x")
      self.g_rug.columnconfigure(0, weight=1)
    if bl:
      pb = self.paginas["Borde libre"]
      tk.Label(pb, text="Altura libre entre el agua y la corona del canal, según Villón. "
                        "Se suma al tirante y se dibuja en la sección.",
               bg=SURFACE, fg=MUTED, font=fnt(9), anchor="w", justify="left",
               wraplength=310).pack(fill="x", pady=(0, 10))
      self._selector(pb, "bl", "Criterio", BL_MODOS, BL_MODOS[0])
      tk.Label(pb, text="No se aplica a tuberías circulares cerradas.",
               bg=SURFACE, fg=MUTED, font=fnt(9), anchor="w").pack(fill="x")

    for item in campos:
      clave, etiqueta, defecto, unidad = item[:4]
      extra = item[4] if len(item) > 4 else None
      grupo = "rug" if clave in rug_keys else "datos"
      celda = tk.Frame(self.g_rug if grupo == "rug" else self.g_datos, bg=SURFACE)
      self.celdas[clave] = celda
      self.orden.append(clave)
      self.visibles[clave] = True
      self.grupo_de[clave] = grupo
      if clave == "_cowan":
        ttk.Button(celda, text="Elegir factores de Cowan…", style="Ghost.TButton",
                   cursor="hand2",
                   command=lambda: CowanDialog(self, "n")).pack(anchor="w")
        continue
      var = tk.StringVar(value=defecto)
      lbl = tk.Label(celda, text=etiqueta, bg=SURFACE, fg=INK, font=fnt(10), anchor="w")
      lbl.pack(side="left")
      tk.Label(celda, text=unidad, bg=SURFACE, fg=MUTED, font=fnt(9), width=5,
               anchor="w").pack(side="right", padx=(6, 0))
      ent = ttk.Entry(celda, textvariable=var, width=10, justify="right")
      ent.pack(side="right")
      if extra == "cowan":
        btn = ttk.Button(celda, text="Cowan", style="Ghost.TButton", cursor="hand2",
                         command=lambda c=clave: CowanDialog(self, c))
        btn.pack(side="right", padx=(0, 8))
        self.btns_cowan[clave] = btn
      self.vars[clave], self.entradas[clave], self.lbls[clave] = var, ent, lbl
      self.etiquetas[clave] = etiqueta
      self.unidades[clave] = unidad

    if rug:
      for k, _, _ in self.rug_cfg["horton"]:
        self.visibles[k] = False
      if "_cowan" in self.visibles:
        self.visibles["_cowan"] = False

    self.lbl_error = tk.Label(pie, text="", bg=ERROR_BG, fg=DANGER, font=fnt(9),
                              wraplength=300, justify="left", anchor="w", padx=10, pady=6)
    self.btn_calcular = ttk.Button(pie, text="Calcular", style="Primary.TButton",
                                   cursor="hand2", command=self._ejecutar)
    self.btn_calcular.pack(fill="x")
    tk.Label(pie, text="También puede pulsar Enter.", bg=SURFACE, fg=MUTED,
             font=fnt(8), anchor="w").pack(fill="x", pady=(6, 0))

    # ---------------- panel derecho ----------------
    der = tk.Frame(cuerpo, bg=BG)
    der.grid(row=0, column=1, sticky="nsew")

    if dibujo:
      cd = tarjeta(der)
      cd.pack(fill="x")
      tk.Label(cd, text="Sección transversal", bg=SURFACE, fg=INK,
               font=fnt(11, "bold")).pack(anchor="w", padx=16, pady=(12, 0))
      marco = tk.Frame(cd, bg=SURFACE, height=ALTO_GRAFICO)
      marco.pack(fill="x", padx=16, pady=(6, 14))
      marco.pack_propagate(False)
      if HAY_PIL:
        self.cv = tk.Label(marco, bg=SURFACE, bd=0)
      else:
        self.cv = tk.Canvas(marco, height=ALTO_GRAFICO, bg=SURFACE, highlightthickness=0)
      self.cv.pack(fill="both", expand=True)
      marco.bind("<Configure>", self._al_redimensionar)
      self._pintar()

    cr = tarjeta(der)
    cr.pack(fill="both", expand=True, pady=(14, 0) if dibujo else 0)
    top = tk.Frame(cr, bg=SURFACE)
    top.pack(fill="x", padx=16, pady=(12, 4))
    tk.Label(top, text="Resultados", bg=SURFACE, fg=INK, font=fnt(11, "bold")).pack(side="left")
    self.btn_copiar = ttk.Button(top, text="Copiar", style="Ghost.TButton",
                                 cursor="hand2", command=self._copiar)
    self.btn_informe = None
    if HAY_PIL:
      self.btn_informe = ttk.Button(top, text="Informe PDF", style="Ghost.TButton",
                                    cursor="hand2", command=self._exportar)
    self.res = tk.Frame(cr, bg=SURFACE)
    self.res.pack(fill="both", expand=True, padx=16, pady=(4, 14))
    self._vacio()
    self._al_cambiar()
    self._ir_a("Datos")

  # ---------- construcción ----------
  def _selector(self, parent, clave, etiqueta, opciones, inicial):
    fila = tk.Frame(parent, bg=SURFACE)
    fila.pack(fill="x")
    tk.Label(fila, text=etiqueta, bg=SURFACE, fg=MUTED, font=fnt(9)).pack(anchor="w")
    var = tk.StringVar(value=inicial)
    cb = ttk.Combobox(fila, textvariable=var, values=opciones, state="readonly", width=34)
    cb.pack(fill="x", pady=(2, 12))
    cb.bind("<<ComboboxSelected>>", lambda e, c=cb: (c.selection_clear(), self._al_cambiar()))
    cb.bind("<MouseWheel>", self._rueda_combo)
    self.sels[clave] = var
    self.filas_sel[clave] = fila
    self.etq_sel[clave] = etiqueta

  def _rueda_combo(self, e):
    self.app.rueda(e)
    return "break"

  def _crear_tab(self, barra, nombre):
    celda = tk.Frame(barra, bg=SURFACE, cursor="hand2")
    celda.pack(side="left", padx=(8, 4))
    lbl = tk.Label(celda, text=nombre, bg=SURFACE, fg=MUTED, font=fnt(10, "bold"),
                   cursor="hand2", padx=6, pady=6)
    lbl.pack()
    linea = tk.Frame(celda, bg=SURFACE, height=3)
    linea.pack(fill="x")
    for w in (celda, lbl, linea):
      w.bind("<Button-1>", lambda e, n=nombre: self._ir_a(n))
    self.tabs[nombre] = (lbl, linea)

  def _ir_a(self, nombre):
    self.paginas[nombre].tkraise()
    anim = self.app.anim
    for n, (lbl, linea) in self.tabs.items():
      activa = n == nombre
      anim.color(lbl, "fg", INK if activa else MUTED, 140)
      anim.color(linea, "bg", self.app.acento[2] if activa else SURFACE, 180)

  # ---------- lectura de datos ----------
  def v(self, clave, cero=False):
    etiqueta = self.etiquetas[clave]
    try:
      x = float(self.vars[clave].get().replace(",", "."))
    except ValueError:
      raise ErrorCampo(f"«{etiqueta}» debe ser un número. Ejemplo: 1.5", clave)
    if (x < 0) if cero else (x <= 0):
      raise ErrorCampo(
          f"«{etiqueta}» debe ser " + ("cero o mayor." if cero else "mayor que cero."),
          clave)
    return x

  def sel(self, clave):
    return self.sels[clave].get()

  def geo(self, tipo):
    """Lee b, z, d según el tipo de sección."""
    b = self.v("b") if tipo in ("Trapezoidal", "Rectangular") else 0.0
    z = self.v("z", cero=(tipo == "Trapezoidal")) if tipo in ("Trapezoidal", "Triangular") else 0.0
    d = self.v("d") if tipo == "Circular" else 0.0
    return b, z, d

  # ---------- rugosidad ----------
  def rugosidad(self, tipo="Trapezoidal"):
    """Devuelve una función n(y, b, z) según el modo de rugosidad elegido.

    Valor único y Cowan dan un n constante. En el modo compuesto se calcula el
    n equivalente de Horton-Einstein con los perímetros del fondo y de los dos
    lados, que dependen del tirante y de la geometría.
    """
    if self.sel("rug").startswith("Compuesta"):
      if tipo == "Circular":
        raise ErrorCampo(
            "La rugosidad compuesta no se aplica a la sección circular. "
            "Use valor único o Cowan.", "_rug"
        )
      nf = self.v("nf") if tipo != "Triangular" else None
      ni, nd = self.v("ni"), self.v("nd")

      def n_de(y, b, z):
        k = math.sqrt(1 + z**2)
        partes = [(y * k, ni), (y * k, nd)]
        if nf is not None:
          partes.append((b, nf))
        return n_horton(partes)

      return n_de
    n = self.v("n")
    return lambda y, b, z: n

  def fila_n(self, n):
    modo = self.sel("rug")
    if modo.startswith("Compuesta"):
      nombre = "n equivalente (Horton-Einstein)"
    elif modo == "Cowan":
      nombre = "Rugosidad n (Cowan)"
    else:
      nombre = "Rugosidad n"
    return (nombre, f"{n:.5f}", "")

  # ---------- borde libre ----------
  def borde_libre(self, Q, b, y, tipo):
    """Devuelve (BL, revestido, filas) o None si no se incluye borde libre."""
    modo = self.sel("bl")
    if modo == BL_MODOS[0]:
      return None
    if tipo == "Circular":
      raise ErrorCampo(
          "El borde libre no se aplica a la tubería circular. Elija «No incluir».",
          "_bl")
    try:
      bl, revest = borde_libre_villon(modo, Q, b, y)
    except ValueError as e:
      raise ErrorCampo(str(e), "_bl")
    return bl, revest, [("Borde libre BL", f"{bl:.3f}", "m"),
                        ("Altura total del canal H", f"{y + bl:.3f}", "m")]

  def con_bl(self, r, Q, b, y, tipo):
    """Añade el borde libre (si se eligió) a las filas y al dibujo de r."""
    res = self.borde_libre(Q, b, y, tipo)
    if res:
      bl, revest, filas = res
      r["filas"] = r["filas"] + filas
      r["dibujo"] = dict(r["dibujo"], bl=bl, revest=revest)
    return r

  def activar(self, clave, activo):
    if clave not in self.entradas:
      return
    self.estado[clave] = activo
    self.entradas[clave].configure(state="normal" if activo else "disabled")
    self.lbls[clave].configure(fg=INK if activo else DISABLED)

  def _al_cambiar(self):
    if self.rug:
      for k in self.rug_cfg["simples"]:
        self.activar(k, True)
    if self.habilitar:
      self.habilitar(self)
    if self.rug:
      self._actualizar_rug()
    self._reacomodar()

  def _actualizar_rug(self):
    cfg = self.rug_cfg
    activa = self.rug_activa(self) if self.rug_activa else True
    modo = self.sel("rug")
    hor = activa and modo.startswith("Compuesta")
    cow = activa and modo == "Cowan"
    if activa:
      self.info_rug.pack_forget()
      self.filas_sel["rug"].pack(fill="x", before=self.g_rug)
    else:
      self.filas_sel["rug"].pack_forget()
      self.info_rug.pack(fill="x", before=self.g_rug)
    for k in cfg["simples"]:
      self.visibles[k] = not hor
    for k, _, _ in cfg["horton"]:
      self.visibles[k] = hor
    if "_cowan" in self.visibles:
      self.visibles["_cowan"] = cow
    for btn in self.btns_cowan.values():
      btn.configure(state="normal" if cow else "disabled")
    if cow:
      for k in cfg["simples"]:
        self.activar(k, False)
        estado = self.cowan_estados.setdefault(k, cowan_estado_inicial())
        self.vars[k].set(f"{cowan_n(estado):.4f}")
    if hor and "nf" in self.entradas:
      tipo = self.sels["tipo"].get() if "tipo" in self.sels else "Trapezoidal"
      self.activar("nf", tipo != "Triangular")

  def _reacomodar(self):
    fila = {"datos": 0, "rug": 0}
    for clave in self.orden:
      celda = self.celdas[clave]
      if not self.visibles[clave]:
        celda.grid_remove()
        continue
      g = self.grupo_de[clave]
      celda.grid(row=fila[g], column=0, sticky="ew", pady=4)
      fila[g] += 1

  # ---------- ejecución ----------
  def _error(self, texto):
    if texto:
      self.lbl_error.config(text=texto)
      self.lbl_error.pack(fill="x", pady=(0, 10), before=self.btn_calcular)
    else:
      self.lbl_error.pack_forget()

  def _ejecutar(self, *_):
    self._error("")
    try:
      r = self.calcular(self)
    except ValueError as e:
      self._error(str(e))
      clave = getattr(e, "clave", None)
      if clave:  # lleva al usuario a la pestaña y al campo con el problema
        if clave == "_bl":
          pagina = "Borde libre"
        elif clave == "_rug" or self.grupo_de.get(clave) == "rug":
          pagina = "Rugosidad"
        else:
          pagina = "Datos"
        if pagina in self.paginas:
          self._ir_a(pagina)
        if clave in self.entradas:
          self.entradas[clave].focus_set()
      return
    except ZeroDivisionError:
      self._error("Hay un valor en cero que impide el cálculo. Revise los datos.")
      return
    self.mostrar(r["filas"], r.get("nota"))
    self._ultimo = (r["filas"], r.get("nota"))
    self._registrar(r["filas"])
    if self.cv is not None and r.get("dibujo"):
      self._dibujo = (r.get("dibujo_fn", dibujar_seccion), r["dibujo"])
      self._pintar()

  def _pintar(self):
    if self.cv is None:
      return
    if not HAY_PIL:
      if self._dibujo is None:
        dibujar_seccion(self.cv, "Trapezoidal", None)
      else:
        fn, kw = self._dibujo
        fn(self.cv, **kw)
      return
    self._detener_agua()
    w = max(self._cv_w, 320)
    if self._dibujo is None:
      esc = escena_seccion(w, ALTO_GRAFICO, "Trapezoidal", None)
    else:
      fn, kw = self._dibujo
      esc = ESCENA[fn](w, ALTO_GRAFICO, **kw)
    self._escena = esc
    self._cuadros = [ImageTk.PhotoImage(esc.fotograma(0.0))]
    self._i = 0
    self.cv.configure(image=self._cuadros[0])
    if esc.olas is not None:       # el agua se anima: primero se preparan los cuadros
      self._anim_id = self.after(60, self._gen_agua)

  def _detener_agua(self):
    if self._anim_id is not None:
      try:
        self.after_cancel(self._anim_id)
      except tk.TclError:
        pass
      self._anim_id = None

  def _gen_agua(self):
    self._anim_id = None
    if not self.winfo_exists() or self._escena is None:
      return
    k = len(self._cuadros)
    if k < NF_ANIM:
      self._cuadros.append(ImageTk.PhotoImage(self._escena.fotograma(k / NF_ANIM)))
      self._anim_id = self.after(12, self._gen_agua)
    else:
      self._anim_id = self.after(110, self._animar_agua)

  def _animar_agua(self):
    self._anim_id = None
    if not self.winfo_exists():
      return
    self._i = (self._i + 1) % len(self._cuadros)
    self.cv.configure(image=self._cuadros[self._i])
    self._anim_id = self.after(110, self._animar_agua)

  def _al_redimensionar(self, e):
    if abs(e.width - self._cv_w) > 2:
      self._cv_w = e.width
      if self._tarea is not None:
        self.after_cancel(self._tarea)
      self._tarea = self.after(90, self._repintar)

  def _repintar(self):
    self._tarea = None
    if self.winfo_exists():
      self._pintar()

  def _vacio(self):
    for w in self.res.winfo_children():
      w.destroy()
    self.btn_copiar.pack_forget()
    if self.btn_informe is not None:
      self.btn_informe.pack_forget()
    tk.Label(self.res, text="Complete los datos y pulse «Calcular».",
             bg=SURFACE, fg=MUTED, font=fnt(10)).pack(anchor="w", pady=16)

  def mostrar(self, filas, nota=None):
    for w in self.res.winfo_children():
      w.destroy()
    self.btn_copiar.pack(side="right")
    if self.btn_informe is not None:
      self.btn_informe.pack(side="right", padx=(0, 6))

    et, val, uni = filas[0]
    banda = tk.Frame(self.res, bg=TINTE)
    banda.pack(fill="x")
    tk.Frame(banda, bg=self.app.acento[2], width=4).pack(side="left", fill="y")
    centro = tk.Frame(banda, bg=TINTE)
    centro.pack(side="left", fill="x", expand=True, padx=14, pady=10)
    tk.Label(centro, text=et, bg=TINTE, fg=MUTED, font=fnt(10), anchor="w").pack(fill="x")
    fr = tk.Frame(centro, bg=TINTE)
    fr.pack(fill="x")
    lbl_val = tk.Label(fr, text=val, bg=TINTE, fg=WATER_DK, font=fnt(22, "bold"))
    lbl_val.pack(side="left")
    self.app.anim.numero(lbl_val, val)
    if uni:
      tk.Label(fr, text=f" {uni}", bg=TINTE, fg=MUTED, font=fnt(12)).pack(
          side="left", anchor="s", pady=(0, 5))

    mosaico = tk.Frame(self.res, bg=SURFACE)
    mosaico.pack(fill="x", pady=(8, 0))
    for c in range(3):
      mosaico.columnconfigure(c, weight=1, uniform="mosaico")
    anim = self.app.anim
    for i, (et, val, uni) in enumerate(filas[1:]):
      celda = tk.Frame(mosaico, bg=SURFACE2, highlightthickness=1, highlightbackground=LINE)
      celda.grid(row=i // 3, column=i % 3, sticky="nsew", padx=4, pady=4)
      l1 = tk.Label(celda, text=et, bg=SURFACE2, fg=SURFACE2, font=fnt(9), anchor="w",
                    justify="left", wraplength=120)
      l1.pack(fill="x", padx=10, pady=(8, 0))
      fila = tk.Frame(celda, bg=SURFACE2)
      fila.pack(fill="x", padx=10, pady=(1, 8))
      l2 = tk.Label(fila, text=val, bg=SURFACE2, fg=SURFACE2, font=fnt(12, "bold"),
                    wraplength=125, justify="left")
      l2.pack(side="left")
      anim.color(l1, "fg", MUTED, 280, retraso=70 * i)
      anim.color(l2, "fg", INK, 280, retraso=70 * i + 40)
      if uni:
        l3 = tk.Label(fila, text=uni, bg=SURFACE2, fg=SURFACE2, font=fnt(9))
        l3.pack(side="left", anchor="s", padx=(4, 1))
        anim.color(l3, "fg", MUTED, 280, retraso=70 * i + 80)

    if nota:
      tk.Label(self.res, text=nota, bg=SURFACE, fg=MUTED, font=fnt(9), wraplength=420,
               justify="left", anchor="w").pack(fill="x", pady=(10, 0))

    lineas = [f"{e}: {v} {u}".strip() for e, v, u in filas]
    if nota:
      lineas.append(nota)
    self.texto_copiable = "\n".join(lineas)

  # ---------- banner, historial e informe ----------
  def _pintar_banner(self):
    c1, c2, _ = self.app.acento
    kind = self.app.info.get(self.app.activo, ("", "normal"))[1]
    img = render_banner(max(self._banner_w, 520), ALTO_BANNER, self.titulo,
                        self.descripcion, kind, c1, c2)
    self._banner_foto = ImageTk.PhotoImage(img)
    self._banner.configure(image=self._banner_foto)

  def _al_banner(self, e):
    if abs(e.width - self._banner_w) > 2:
      self._banner_w = e.width
      if self._banner_tarea is not None:
        self.after_cancel(self._banner_tarea)
      self._banner_tarea = self.after(90, self._repintar_banner)

  def _repintar_banner(self):
    self._banner_tarea = None
    if self.winfo_exists():
      self._pintar_banner()

  def datos_entrada(self):
    """Lista de (etiqueta, valor, unidad) de los datos que intervienen en el cálculo."""
    filas = []
    nombres = {"rug": "Rugosidad", "bl": "Borde libre"}
    for k, var in self.sels.items():
      if k == "rug" and self.rug_activa and not self.rug_activa(self):
        continue
      filas.append((nombres.get(k, self.etq_sel.get(k, k)), var.get(), ""))
    cowan = self.rug and self.sel("rug") == "Cowan"
    simples = set(self.rug_cfg["simples"]) if self.rug else set()
    for k in self.orden:
      if k == "_cowan" or not self.visibles.get(k, True):
        continue
      if not self.estado.get(k, True) and not (cowan and k in simples):
        continue
      filas.append((self.etiquetas[k], self.vars[k].get(), self.unidades.get(k, "")))
    return filas

  def _registrar(self, filas):
    et, val, uni = filas[0]
    self.app.almacen.registrar({
        "t": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "clave": self.app.activo,
        "titulo": self.titulo,
        "resumen": f"{et} = {val} {uni}".strip(),
        "vars": {k: v.get() for k, v in self.vars.items()},
        "sels": {k: v.get() for k, v in self.sels.items()},
        "cowan": dict(self.cowan_estados),
    })

  def _exportar(self):
    if self._ultimo is None:
      return
    from tkinter import filedialog, messagebox
    filas, nota = self._ultimo
    nombre = "".join(c for c in self.titulo if c.isalnum() or c in " -_")
    ruta = filedialog.asksaveasfilename(
        parent=self, title="Guardar informe", defaultextension=".pdf",
        initialfile=f"Informe {nombre}.pdf",
        filetypes=[("Documento PDF", "*.pdf"), ("Imagen PNG", "*.png")])
    if not ruta:
      return
    try:
      img = render_informe(self.titulo, self.descripcion, self.datos_entrada(),
                           filas, nota, self._dibujo)
      if ruta.lower().endswith(".png"):
        img.save(ruta)
      else:
        img.save(ruta, "PDF", resolution=150.0)
    except Exception as e:  # noqa: BLE001 - se informa al usuario
      messagebox.showerror("No se pudo guardar el informe", str(e), parent=self)
      return
    self.btn_informe.config(text="Guardado")
    self.after(1800, lambda: self.btn_informe.config(text="Informe PDF"))

  def _copiar(self):
    self.clipboard_clear()
    self.clipboard_append(self.texto_copiable)
    self.btn_copiar.config(text="Copiado")
    self.after(1400, lambda: self.btn_copiar.config(text="Copiar"))


# ======================================================================
# CAMPOS COMUNES
# ======================================================================
def habilitar_seccion(w):
  t = w.sel("tipo")
  w.activar("b", t in ("Trapezoidal", "Rectangular"))
  w.activar("z", t in ("Trapezoidal", "Triangular"))
  w.activar("d", t == "Circular")


def habilitar_inverso(w):
  t = w.sel("tipo") if "tipo" in w.sels else "Trapezoidal"
  inc = w.sel("inc") if "inc" in w.sels else "Pendiente S"
  w.activar("S", inc != "Pendiente S")
  w.activar("n", inc != "Rugosidad n")
  w.activar("y", inc != "Tirante y")
  w.activar("b", (t in ("Trapezoidal", "Rectangular")) and (inc != "Ancho de solera b"))
  w.activar("z", (t in ("Trapezoidal", "Triangular")) and (inc != "Talud lateral z"))
  w.activar("d", (t == "Circular") and (inc != "Diámetro D"))


def habilitar_optima(w):
  w.activar("z", w.sel("tipo") == "Trapezoidal")


def habilitar_compuesta(w):
  calc_y = w.sel("modo").endswith("tirante y")
  w.activar("Q", calc_y)
  w.activar("y", not calc_y)
  t = w.sel("tipo")
  w.activar("b", t in ("Trapezoidal", "Rectangular"))
  w.activar("z", t in ("Trapezoidal", "Triangular"))


SEC_OPT = ["Trapezoidal", "Rectangular", "Triangular", "Semicircular"]
SEL_OPT = [("tipo", "Tipo de sección", SEC_OPT, "Trapezoidal")]
SEL_CANAL = [("tipo", "Forma del canal principal", SEC_OPT, "Trapezoidal")]


SEL_TIPO = [("tipo", "Tipo de sección", SECCIONES, "Trapezoidal")]

C_Q = ("Q", "Caudal Q", "5.0", "m³/s")
C_S = ("S", "Pendiente S", "0.001", "m/m")
C_N = ("n", "Rugosidad n (Manning)", "0.015", "")
C_B = ("b", "Ancho de solera b", "1.5", "m")
C_Z = ("z", "Talud z (H:V)", "1.0", "")
C_D = ("d", "Diámetro D", "2.0", "m")


# ======================================================================
# APLICACIÓN PRINCIPAL
# ======================================================================
class ElCaudaloso:

  def __init__(self, root):
    self.root = root
    init_fonts()
    root.title("EL CAUDALOSO")
    self.almacen = Almacen()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    w, h = min(1280, sw - 60), min(800, sh - 100)
    guardado = self.almacen.datos.get("ventana")
    if isinstance(guardado, list) and len(guardado) == 2:
      try:
        w = max(900, min(int(guardado[0]), sw))
        h = max(600, min(int(guardado[1]), sh))
      except (TypeError, ValueError):
        pass
    root.geometry(f"{w}x{h}+{max((sw - w) // 2, 0)}+{max((sh - h) // 2 - 20, 0)}")
    root.minsize(min(1100, w), min(620, h))
    root.configure(bg=BG)
    configurar_estilos(root)
    root.protocol("WM_DELETE_WINDOW", self._cerrar)
    if HAY_PIL:
      try:
        self._icono_app = ImageTk.PhotoImage(render_logo(64))
        root.iconphoto(True, self._icono_app)
      except tk.TclError:
        pass

    self.anim = Animador(root)
    self._cortina = None
    self.pagina = None      # contenedor desplazable de la pantalla actual
    self.modulo = None      # módulo de cálculo abierto (si lo hay)
    self.activo = None
    self.acento = ACENTO_BASE
    self.items = {}
    self._fotos = {}

    self.info = {
        "normal": ("Profundidad del flujo uniforme con la ecuación de Manning.", "normal"),
        "critico": ("Profundidad donde la energía específica es mínima (Fr = 1).", "critico"),
        "caudal": ("Caudal y velocidad para un tirante conocido, en cualquier sección.", "caudal"),
        "inverso": ("Halla la pendiente, la rugosidad o el ancho que necesita el canal.", "inverso"),
        "meh": ("Dimensiones de la sección que conduce el caudal con menor área.", "meh"),
        "minima": ("Sección que reduce el perímetro mojado y las pérdidas por filtración.", "minima"),
        "compuesta": ("Canal principal con planicies de inundación, por subsecciones.", "compuesta"),
        "resalto": ("Tirante conjugado y pérdida de energía en un canal rectangular.", "resalto"),
        "remanso": ("Clasifica el perfil de flujo según yn, yc y el tirante actual.", "remanso"),
    }
    self.menu = [
        (None, [("inicio", "Inicio", self.abrir_inicio)]),
        ("Tirantes y caudales", [
            ("normal", "Tirante normal", self.abrir_normal),
            ("critico", "Tirante crítico", self.abrir_critico),
            ("caudal", "Caudales", self.abrir_caudal),
            ("inverso", "Cálculo inverso", self.abrir_inverso)]),
        ("Diseño de secciones", [
            ("meh", "Máxima eficiencia hidráulica", self.abrir_meh),
            ("minima", "Mínima infiltración", self.abrir_minima),
            ("compuesta", "Sección compuesta", self.abrir_compuesta)]),
        ("Flujo variado", [
            ("resalto", "Resalto hidráulico", self.abrir_resalto),
            ("remanso", "Curvas de remanso", self.abrir_remanso)]),
    ]
    self.comandos = {c: cmd for _, lista in self.menu for c, _, cmd in lista}
    self.acento_de = {c: GRUPOS.get(g, ACENTO_BASE) for g, lista in self.menu for c, _, _ in lista}
    self.titulos = {c: t for _, lista in self.menu for c, t, _ in lista}

    # ---------------- menú lateral ----------------
    lateral = tk.Frame(root, bg=SIDE_BG, width=250)
    lateral.pack(side="left", fill="y")
    lateral.pack_propagate(False)
    tk.Frame(lateral, bg=WATER, height=4).pack(fill="x")
    marca = tk.Frame(lateral, bg=SIDE_BG)
    marca.pack(fill="x", padx=20, pady=(22, 20))
    if HAY_PIL:
      self._logo = ImageTk.PhotoImage(render_logo(44))
      tk.Label(marca, image=self._logo, bg=SIDE_BG, bd=0).pack(side="left", padx=(0, 12))
    textos = tk.Frame(marca, bg=SIDE_BG)
    textos.pack(side="left")
    tk.Label(textos, text="EL CAUDALOSO", bg=SIDE_BG, fg="#FFFFFF",
             font=fnt(14, "bold"), anchor="w").pack(anchor="w")
    tk.Label(textos, text="Hidráulica de canales", bg=SIDE_BG, fg=SIDE_MUTED,
             font=fnt(9), anchor="w").pack(anchor="w")
    pie_l = tk.Frame(lateral, bg=SIDE_BG)
    pie_l.pack(side="bottom", fill="x", padx=20, pady=(0, 18))
    tk.Label(pie_l, text="Escuela Profesional de Ingeniería Civil, UNCP",
             bg=SIDE_BG, fg=SIDE_MUTED, font=fnt(9), anchor="w", justify="left",
             wraplength=210).pack(fill="x")
    acerca = tk.Label(pie_l, text=f"Acerca de, versión {VERSION}", bg=SIDE_BG,
                      fg=SIDE_TEXT, font=fnt(9, "underline"), anchor="w", cursor="hand2")
    acerca.pack(fill="x", pady=(8, 0))
    acerca.bind("<Button-1>", lambda e: self._acerca())
    nav = tk.Frame(lateral, bg=SIDE_BG)
    nav.pack(fill="both", expand=True)
    for grupo, lista in self.menu:
      if grupo:
        fila_g = tk.Frame(nav, bg=SIDE_BG)
        fila_g.pack(fill="x", padx=20, pady=(16, 4))
        tk.Frame(fila_g, bg=GRUPOS[grupo][2], width=8, height=8).pack(side="left", padx=(0, 8))
        tk.Label(fila_g, text=grupo, bg=SIDE_BG, fg=SIDE_MUTED, font=fnt(9),
                 anchor="w").pack(side="left")
      for clave, titulo, _ in lista:
        self._item_nav(nav, clave, titulo)

    # ---------------- contenido ----------------
    self.contenido = tk.Frame(root, bg=BG)
    self.contenido.pack(side="left", fill="both", expand=True)

    root.bind("<Return>", self._enter)
    root.bind_all("<MouseWheel>", self.rueda)
    root.bind_all("<Button-4>", self.rueda)
    root.bind_all("<Button-5>", self.rueda)
    self._navegar("inicio")

  # ---------- navegación ----------
  def _item_nav(self, nav, clave, titulo):
    fila = tk.Frame(nav, bg=SIDE_BG, cursor="hand2")
    fila.pack(fill="x")
    barra = tk.Frame(fila, bg=SIDE_BG, width=3)
    barra.pack(side="left", fill="y")
    lbl = tk.Label(fila, text=titulo, bg=SIDE_BG, fg=SIDE_TEXT, font=fnt(10),
                   anchor="w", padx=17, pady=7, cursor="hand2")
    lbl.pack(side="left", fill="x", expand=True)
    self.items[clave] = (fila, barra, lbl)

    def entrar(e):
      if clave != self.activo:
        self._fondo_nav(clave, SIDE_HOVER)

    def salir(e):
      if clave != self.activo:
        self._fondo_nav(clave, SIDE_BG)

    for w in (fila, barra, lbl):
      w.bind("<Button-1>", lambda e, c=clave: self._navegar(c))
      w.bind("<Enter>", entrar)
      w.bind("<Leave>", salir)

  def _fondo_nav(self, clave, color):
    for w in self.items[clave]:
      self.anim.color(w, "bg", color, 110)

  def _pintar_nav(self):
    for clave, (fila, barra, lbl) in self.items.items():
      if clave == self.activo:
        self.anim.color(fila, "bg", SIDE_ACTIVE, 170)
        self.anim.color(barra, "bg", self.acento_de[clave][2], 170)
        self.anim.color(lbl, "bg", SIDE_ACTIVE, 170)
        self.anim.color(lbl, "fg", "#FFFFFF", 170)
      else:
        self.anim.color(fila, "bg", SIDE_BG, 170)
        self.anim.color(barra, "bg", SIDE_BG, 170)
        self.anim.color(lbl, "bg", SIDE_BG, 170)
        self.anim.color(lbl, "fg", SIDE_TEXT, 170)

  def _navegar(self, clave):
    self.activo = clave
    self.acento = self.acento_de.get(clave, ACENTO_BASE)
    self.modulo = None
    self._pintar_nav()
    if self.pagina is not None:
      self.pagina.destroy()
    self.pagina = MarcoDesplazable(self.contenido)
    self.pagina.pack(fill="both", expand=True)
    self.comandos[clave]()
    if self._cortina is not None:
      try:
        self._cortina.destroy()
      except tk.TclError:
        pass
    self._cortina = self.anim.cortina(self.contenido, BG, 320)

  def _enter(self, e):
    if self.modulo is not None:
      self.modulo._ejecutar()

  def rueda(self, e):
    if self.pagina is not None:
      self.pagina.rueda(e)

  def restaurar(self, entrada):
    """Reabre un cálculo del historial con sus datos y lo vuelve a ejecutar."""
    if entrada.get("clave") not in self.comandos:
      return
    self._navegar(entrada["clave"])
    m = self.modulo
    if m is None:
      return
    for k, v in entrada.get("sels", {}).items():
      if k in m.sels:
        m.sels[k].set(v)
    m.cowan_estados.update(entrada.get("cowan", {}))
    m._al_cambiar()
    for k, v in entrada.get("vars", {}).items():
      if k in m.vars:
        m.vars[k].set(v)
    m._ejecutar()

  def _borrar_historial(self):
    self.almacen.borrar()
    self._navegar("inicio")

  def _cerrar(self):
    try:
      self.almacen.datos["ventana"] = [self.root.winfo_width(), self.root.winfo_height()]
      self.almacen.guardar()
    except tk.TclError:
      pass
    self.root.destroy()

  # ---------- pantalla de inicio ----------
  def _hero_animado(self, f):
    if not HAY_PIL:
      tk.Label(f, text="EL CAUDALOSO", bg=BG, fg=INK, font=fnt(24, "bold"),
               anchor="w").pack(fill="x")
      return
    N = 12
    marco = tk.Frame(f, bg=BG, height=ALTO_HERO)
    marco.pack(fill="x")
    marco.pack_propagate(False)
    lbl = tk.Label(marco, bg=BG, bd=0)
    lbl.pack(fill="both", expand=True)
    est = {"w": 0, "frames": [], "i": 0, "gen": None, "anim": None, "cambio": None}

    def vivo():
      return marco.winfo_exists()

    def animar():
      est["anim"] = None
      if not vivo():
        return
      est["i"] = (est["i"] + 1) % len(est["frames"])
      lbl.configure(image=est["frames"][est["i"]])
      est["anim"] = marco.after(120, animar)

    def generar():
      est["gen"] = None
      if not vivo():
        return
      k = len(est["frames"])
      img = render_hero(max(est["w"], 520), ALTO_HERO, k / N)
      est["frames"].append(ImageTk.PhotoImage(img))
      if k == 0:
        lbl.configure(image=est["frames"][0])
      if k + 1 < N:
        est["gen"] = marco.after(20, generar)
      else:
        est["anim"] = marco.after(120, animar)

    def reiniciar():
      est["cambio"] = None
      for clave in ("gen", "anim"):
        if est[clave] is not None:
          marco.after_cancel(est[clave])
          est[clave] = None
      est["frames"], est["i"] = [], 0
      if vivo():
        generar()

    def al_cambiar(e):
      if abs(e.width - est["w"]) > 2:
        est["w"] = e.width
        if est["cambio"] is not None:
          marco.after_cancel(est["cambio"])
        est["cambio"] = marco.after(150, reiniciar)

    marco.bind("<Configure>", al_cambiar)
    generar()

  def _recientes(self, f):
    hist = self.almacen.datos["historial"][:4]
    cab = tk.Frame(f, bg=BG)
    cab.pack(fill="x", pady=(24, 6))
    tk.Label(cab, text="Cálculos recientes", bg=BG, fg=INK, font=fnt(16, "bold")).pack(side="left")
    if not hist:
      tk.Label(f, text="Aquí aparecerán sus últimos cálculos para retomarlos con un clic.",
               bg=BG, fg=MUTED, font=fnt(10), anchor="w").pack(fill="x")
      return
    borrar = tk.Label(cab, text="Borrar historial", bg=BG, fg=MUTED,
                      font=fnt(9, "underline"), cursor="hand2")
    borrar.pack(side="right", anchor="s")
    borrar.bind("<Button-1>", lambda e: self._borrar_historial())
    for ent in hist:
      acento = self.acento_de.get(ent.get("clave"), ACENTO_BASE)[2]
      fila = tk.Frame(f, bg=SURFACE, highlightthickness=1, highlightbackground=LINE,
                      cursor="hand2")
      fila.pack(fill="x", pady=3)
      tk.Frame(fila, bg=acento, width=5).pack(side="left", fill="y")
      t = tk.Label(fila, text=ent.get("titulo", ""), bg=SURFACE, fg=INK, font=fnt(10, "bold"),
                   width=26, anchor="w", padx=12, pady=9, cursor="hand2")
      t.pack(side="left")
      r = tk.Label(fila, text=ent.get("resumen", ""), bg=SURFACE, fg=MUTED, font=fnt(10),
                   anchor="w", cursor="hand2")
      r.pack(side="left", fill="x", expand=True)
      h = tk.Label(fila, text=ent.get("t", ""), bg=SURFACE, fg=MUTED, font=fnt(9),
                   padx=12, cursor="hand2")
      h.pack(side="right")
      partes = (fila, t, r, h)

      def entrar(e, p=partes, a=acento):
        self.anim.color(p[0], "highlightbackground", a, 120)

      def salir(e, p=partes):
        self.anim.color(p[0], "highlightbackground", LINE, 160)

      for w in partes:
        w.bind("<Enter>", entrar)
        w.bind("<Leave>", salir)
        w.bind("<Button-1>", lambda e, en=ent: self.restaurar(en))

  def abrir_inicio(self):
    f = tk.Frame(self.pagina.interior, bg=BG)
    f.pack(fill="both", expand=True, padx=28, pady=26)
    self._hero_animado(f)
    self._recientes(f)
    tk.Label(f, text="Módulos de cálculo", bg=BG, fg=INK, font=fnt(16, "bold"),
             anchor="w").pack(fill="x", pady=(26, 0))
    tk.Label(f, text="Elija un módulo del menú o de estas tarjetas. Los resultados usan "
                     "el Sistema Internacional, la fórmula de Manning y g = 9.81 m/s².",
             bg=BG, fg=MUTED, font=fnt(10), anchor="w", justify="left",
             wraplength=760).pack(fill="x", pady=(2, 0))
    for n, (grupo, lista) in enumerate(self.menu[1:]):
      fila_g = tk.Frame(f, bg=BG)
      fila_g.pack(fill="x", pady=(18, 6))
      tk.Frame(fila_g, bg=GRUPOS[grupo][2], width=10, height=10).pack(side="left", padx=(0, 8))
      tk.Label(fila_g, text=grupo, bg=BG, fg=INK, font=fnt(12, "bold"),
               anchor="w").pack(side="left")
      g = tk.Frame(f, bg=BG)
      g.pack(fill="x")
      g.columnconfigure((0, 1), weight=1, uniform=f"c{n}")
      for i, (clave, titulo, _) in enumerate(lista):
        desc, ico = self.info[clave]
        self._tarjeta_modulo(g, titulo, desc, ico, lambda c=clave: self._navegar(c),
                             i // 2, i % 2, GRUPOS[grupo][2])

  def _tarjeta_modulo(self, parent, titulo, desc, ico, cmd, fila, col, acento):
    card = tk.Frame(parent, bg=SURFACE, highlightthickness=1,
                    highlightbackground=LINE, cursor="hand2")
    card.grid(row=fila, column=col, sticky="nsew", padx=6, pady=6)
    card.columnconfigure(2, weight=1)
    tk.Frame(card, bg=acento, width=5).grid(row=0, column=0, rowspan=2, sticky="ns")
    if HAY_PIL:
      if ico not in self._fotos:
        self._fotos[ico] = ImageTk.PhotoImage(render_icono(ico))
      cv = tk.Label(card, image=self._fotos[ico], bg=SURFACE, bd=0)
    else:
      cv = tk.Canvas(card, width=84, height=56, bg=SURFACE, highlightthickness=0)
      icono(cv, ico)
    cv.grid(row=0, column=1, rowspan=2, padx=(14, 12), pady=12)
    t = tk.Label(card, text=titulo, bg=SURFACE, fg=INK, font=fnt(12, "bold"),
                 anchor="w", justify="left")
    t.grid(row=0, column=2, sticky="sw", padx=(0, 14), pady=(12, 0))
    d = tk.Label(card, text=desc, bg=SURFACE, fg=MUTED, font=fnt(10),
                 anchor="nw", justify="left", wraplength=230)
    d.grid(row=1, column=2, sticky="nw", padx=(0, 14), pady=(2, 12))
    partes = [card, cv, t, d]

    def entrar(_):
      self.anim.color(card, "highlightbackground", acento, 130)
      for p in partes:
        self.anim.color(p, "bg", HOVER, 130)

    def salir(e):
      if card.winfo_containing(e.x_root, e.y_root) in partes:
        return
      self.anim.color(card, "highlightbackground", LINE, 170)
      for p in partes:
        self.anim.color(p, "bg", SURFACE, 170)

    for p in partes:
      p.bind("<Enter>", entrar)
      p.bind("<Leave>", salir)
      p.bind("<Button-1>", lambda e, c=cmd: c())

  def _acerca(self):
    v = tk.Toplevel(self.root)
    v.title("Acerca de EL CAUDALOSO")
    v.configure(bg=SURFACE)
    v.resizable(False, False)
    v.transient(self.root)
    caja = tk.Frame(v, bg=SURFACE)
    caja.pack(padx=34, pady=28)
    if HAY_PIL:
      self._logo_acerca = ImageTk.PhotoImage(render_logo(84))
      tk.Label(caja, image=self._logo_acerca, bg=SURFACE, bd=0).pack()
    tk.Label(caja, text="EL CAUDALOSO", bg=SURFACE, fg=INK, font=fnt(20, "bold")).pack(pady=(10, 0))
    tk.Label(caja, text=f"Versión {VERSION}", bg=SURFACE, fg=MUTED, font=fnt(10)).pack()
    tk.Label(caja, text="Software de hidráulica de canales abiertos: tirante normal y crítico, "
                        "secciones óptimas y compuestas, rugosidad (Cowan y Horton-Einstein), "
                        "borde libre (Villón), resalto hidráulico y curvas de remanso.",
             bg=SURFACE, fg=INK, font=fnt(10), wraplength=380, justify="center").pack(pady=(14, 8))
    tk.Label(caja, text="Escuela Profesional de Ingeniería Civil, UNCP", bg=SURFACE,
             fg=MUTED, font=fnt(10)).pack()
    tk.Label(caja, text=f"Historial guardado en: {self.almacen.carpeta}", bg=SURFACE,
             fg=MUTED, font=fnt(8), wraplength=380, justify="center").pack(pady=(10, 14))
    ttk.Button(caja, text="Cerrar", style="Ghost.TButton", cursor="hand2",
               command=v.destroy).pack()

  # ==========================================================
  # 1. TIRANTE NORMAL
  # ==========================================================
  def abrir_normal(self):
    Ventana(self, "Tirante normal",
            "Profundidad del flujo uniforme según la ecuación de Manning.",
            [C_Q, C_S, C_N, C_B, C_Z, C_D], self.calc_normal,
            selectores=SEL_TIPO, dibujo=True, habilitar=habilitar_seccion,
            rug=True, bl=True)

  def calc_normal(self, w):
    tipo = w.sel("tipo")
    Q, S = w.v("Q"), w.v("S")
    b, z, d = w.geo(tipo)
    n_de = w.rugosidad(tipo)
    circ = tipo == "Circular"
    hi = 0.938 * d if circ else 50.0     # 0.938 D = tirante de caudal máximo
    yn = biseccion(lambda y: caudal_manning(tipo, y, b, z, d, S, n_de(y, b, z)) - Q,
                   1e-4, hi, expandir=not circ)
    A, P, T = geometria(tipo, yn, b, z, d)
    V = Q / A
    Fr = froude(V, A, T)
    return w.con_bl({
        "filas": [
            ("Tirante normal yn", f"{yn:.4f}", "m"),
            ("Área hidráulica A", f"{A:.4f}", "m²"),
            ("Perímetro mojado P", f"{P:.4f}", "m"),
            ("Radio hidráulico R", f"{A / P:.4f}", "m"),
            ("Espejo de agua T", f"{T:.4f}", "m"),
            ("Velocidad media V", f"{V:.4f}", "m/s"),
            ("Número de Froude", f"{Fr:.4f} ({regimen(Fr)})", ""),
            w.fila_n(n_de(yn, b, z)),
        ],
        "dibujo": dict(tipo=tipo, y=yn, b=b, z=z, d=d, etiqueta="yn"),
    }, Q, b, yn, tipo)

  # ==========================================================
  # 2. TIRANTE CRÍTICO
  # ==========================================================
  def abrir_critico(self):
    Ventana(self, "Tirante crítico",
            "Profundidad donde la energía específica es mínima (Fr = 1).",
            [C_Q, C_B, C_Z, C_D], self.calc_critico,
            selectores=SEL_TIPO, dibujo=True, habilitar=habilitar_seccion)

  def calc_critico(self, w):
    tipo = w.sel("tipo")
    Q = w.v("Q")
    b, z, d = w.geo(tipo)
    circ = tipo == "Circular"

    def f(y):
      A, _, T = geometria(tipo, y, b, z, d)
      return (Q**2 * T) / (G * A**3) - 1.0 if A > 0 else 1e9

    yc = biseccion(f, 1e-4, 0.999 * d if circ else 50.0, expandir=not circ)
    A, _, T = geometria(tipo, yc, b, z, d)
    V = Q / A
    E = yc + V**2 / (2 * G)
    return {
        "filas": [
            ("Tirante crítico yc", f"{yc:.4f}", "m"),
            ("Área crítica Ac", f"{A:.4f}", "m²"),
            ("Espejo de agua Tc", f"{T:.4f}", "m"),
            ("Velocidad crítica Vc", f"{V:.4f}", "m/s"),
            ("Energía específica mínima Emin", f"{E:.4f}", "m"),
        ],
        "dibujo": dict(tipo=tipo, y=yc, b=b, z=z, d=d, etiqueta="yc"),
    }

  # ==========================================================
  # 3 y 4. SECCIONES ÓPTIMAS
  # ==========================================================
  def abrir_meh(self):
    Ventana(self, "Máxima eficiencia hidráulica",
            "Sección de mayor caudal para un área dada: trapezoidal, rectangular, triangular o semicircular.",
            [C_Q, C_S, C_N, ("z", "Talud z (H:V)", "1.0", "")],
            lambda w: self._seccion_optima(w, 2.0), selectores=SEL_OPT,
            dibujo=True, habilitar=habilitar_optima, rug=True, bl=True)

  def abrir_minima(self):
    Ventana(self, "Mínima infiltración",
            "Sección con la menor pérdida por filtración: trapezoidal, rectangular, triangular o semicircular.",
            [C_Q, C_S, C_N, ("z", "Talud z (H:V)", "0.5", "")],
            lambda w: self._seccion_optima(w, 4.0), selectores=SEL_OPT,
            dibujo=True, habilitar=habilitar_optima, rug=True, bl=True)

  def _seccion_optima(self, w, factor):
    """Dimensiones óptimas para el caudal Q con Manning.

    Trapezoidal y rectangular: b/y = factor·(√(1+z²) − z), con factor 2 (máxima
    eficiencia) o 4 (mínima infiltración). Triangular: z = 1 (lados a 45°).
    Semicircular: tirante igual al radio. En las dos últimas formas ambos
    criterios dan la misma sección.
    """
    tipo = w.sel("tipo")
    Q, S = w.v("Q"), w.v("S")
    n_de = w.rugosidad("Circular" if tipo == "Semicircular" else tipo)
    if tipo == "Trapezoidal":
      z = w.v("z", cero=True)
    elif tipo == "Triangular":
      z = 1.0
    else:
      z = 0.0
    k = math.sqrt(1 + z**2)

    def datos(y):
      if tipo == "Semicircular":
        return 0.0, math.pi * y**2 / 2, math.pi * y, 2 * y
      b = 0.0 if tipo == "Triangular" else factor * y * (k - z)
      return b, (b + z * y) * y, b + 2 * y * k, b + 2 * z * y

    def f(y):
      b, A, P, _ = datos(y)
      return (1.0 / n_de(y, b, z)) * A * (A / P) ** (2 / 3) * math.sqrt(S) - Q

    y = biseccion(f, 1e-4, 50.0)
    b, A, P, T = datos(y)
    V = Q / A
    nombre = "Tirante óptimo y" if factor == 2.0 else "Tirante y"
    filas = [(nombre, f"{y:.4f}", "m")]
    nota = None
    sufijo = ("" if factor == 2.0 else
              " Para esta forma, la mínima infiltración coincide con la máxima eficiencia.")
    if tipo in ("Trapezoidal", "Rectangular"):
      filas += [("Ancho de solera b", f"{b:.4f}", "m"),
                ("Relación b/y", f"{b / y:.4f}", "")]
    elif tipo == "Triangular":
      filas.append(("Talud óptimo z", f"{z:.4f}", ""))
      nota = "El talud óptimo es z = 1 (lados a 45°)." + sufijo
    else:
      filas += [("Diámetro D", f"{2 * y:.4f}", "m"), ("Radio r", f"{y:.4f}", "m")]
      nota = "En la sección semicircular el tirante es igual al radio." + sufijo
    filas += [
        ("Área A", f"{A:.4f}", "m²"),
        ("Perímetro mojado P", f"{P:.4f}", "m"),
        ("Radio hidráulico R", f"{A / P:.4f}", "m"),
        ("Espejo de agua T", f"{T:.4f}", "m"),
        ("Velocidad media V", f"{V:.4f}", "m/s"),
        w.fila_n(n_de(y, b, z)),
    ]
    if tipo == "Semicircular":
      dib = dict(tipo="Circular", y=y, b=0.0, z=0.0, d=2 * y, etiqueta="y")
    else:
      dib = dict(tipo=tipo, y=y, b=b, z=z, d=0.0, etiqueta="y")
    return w.con_bl({"filas": filas, "nota": nota, "dibujo": dib}, Q, b, y, tipo)

  # ==========================================================
  # 5. RESALTO HIDRÁULICO
  # ==========================================================
  def abrir_resalto(self):
    Ventana(self, "Resalto hidráulico",
            "Tirante conjugado y pérdida de energía en un canal rectangular.",
            [C_Q, ("b", "Ancho del canal b", "1.5", "m"),
             ("y1", "Tirante inicial y1", "0.3", "m")],
            self.calc_resalto)

  def calc_resalto(self, w):
    Q, b, y1 = w.v("Q"), w.v("b"), w.v("y1")
    v1 = Q / (b * y1)
    fr1 = v1 / math.sqrt(G * y1)
    if fr1 <= 1.0:
      raise ValueError(
          f"El flujo inicial es subcrítico (Fr1 = {fr1:.3f}). El resalto solo "
          "ocurre con Fr1 mayor que 1: reduzca y1 o aumente Q."
      )
    y2 = (y1 / 2.0) * (math.sqrt(1 + 8 * fr1**2) - 1)
    v2 = Q / (b * y2)
    fr2 = v2 / math.sqrt(G * y2)
    dE = (y2 - y1) ** 3 / (4 * y1 * y2)
    E1 = y1 + v1**2 / (2 * G)
    return {
        "filas": [
            ("Tirante conjugado y2", f"{y2:.4f}", "m"),
            ("Velocidad inicial v1", f"{v1:.4f}", "m/s"),
            ("Froude inicial Fr1", f"{fr1:.4f}", ""),
            ("Velocidad final v2", f"{v2:.4f}", "m/s"),
            ("Froude final Fr2", f"{fr2:.4f}", ""),
            ("Pérdida de energía ΔE", f"{dE:.4f}", "m"),
            ("Pérdida respecto a E1", f"{100 * dE / E1:.1f}", "%"),
        ],
    }

  # ==========================================================
  # 6. CURVAS DE REMANSO
  # ==========================================================
  def abrir_remanso(self):
    Ventana(self, "Curvas de remanso",
            "Clasificación del perfil de flujo según la pendiente y el tirante.",
            [("yn", "Tirante normal yn", "1.2", "m"),
             ("yc", "Tirante crítico yc", "0.8", "m"),
             ("y", "Tirante actual y", "1.5", "m")],
            self.calc_remanso)

  def calc_remanso(self, w):
    yn, yc, y = w.v("yn"), w.v("yc"), w.v("y")
    tipo, perfil, desc = clasificar_remanso(yn, yc, y)
    return {
        "filas": [("Tipo de pendiente", tipo, ""), ("Perfil de flujo", perfil, "")],
        "nota": desc,
    }

  # ==========================================================
  # 7. CAUDALES
  # ==========================================================
  def abrir_caudal(self):
    Ventana(self, "Cálculo de caudales",
            "Caudal y velocidad para un tirante conocido.",
            [C_S, C_N, C_B, C_Z, C_D, ("y", "Tirante de agua y", "1.5", "m")],
            self.calc_caudal, selectores=SEL_TIPO, dibujo=True,
            habilitar=habilitar_seccion, rug=True, bl=True)

  def calc_caudal(self, w):
    tipo = w.sel("tipo")
    S, y = w.v("S"), w.v("y")
    b, z, d = w.geo(tipo)
    n_de = w.rugosidad(tipo)
    if tipo == "Circular" and y > d:
      raise ValueError("El tirante no puede superar el diámetro de la tubería.")
    A, P, T = geometria(tipo, y, b, z, d)
    Q = caudal_manning(tipo, y, b, z, d, S, n_de(y, b, z))
    V = Q / A
    Fr = froude(V, A, T)
    return w.con_bl({
        "filas": [
            ("Caudal Q", f"{Q:.4f}", "m³/s"),
            ("Velocidad media V", f"{V:.4f}", "m/s"),
            ("Área hidráulica A", f"{A:.4f}", "m²"),
            ("Perímetro mojado P", f"{P:.4f}", "m"),
            ("Radio hidráulico R", f"{A / P:.4f}", "m"),
            ("Espejo de agua T", f"{T:.4f}", "m"),
            ("Número de Froude", f"{Fr:.4f} ({regimen(Fr)})", ""),
            w.fila_n(n_de(y, b, z)),
        ],
        "dibujo": dict(tipo=tipo, y=y, b=b, z=z, d=d, etiqueta="y"),
    }, Q, b, y, tipo)

  # ==========================================================
  # 8. CÁLCULO INVERSO (EXPANDIDO MULTISECCIÓN)
  # ==========================================================
  def abrir_inverso(self):
    Ventana(self, "Cálculo inverso",
            "Elija el tipo de sección y qué dato desconoce; se calcula con la ecuación de Manning.",
            [C_Q, ("y", "Tirante y", "1.2", "m"), C_S, C_N, C_B, C_Z, C_D],
            self.calc_inverso,
            selectores=[
                ("tipo", "Tipo de sección", SECCIONES, "Trapezoidal"),
                ("inc", "Incógnita",
                 ["Pendiente S", "Rugosidad n", "Ancho de solera b", "Talud lateral z", "Diámetro D", "Tirante y"],
                 "Pendiente S")],
            dibujo=True, habilitar=habilitar_inverso, rug=True,
            rug_activa=lambda w: w.sel("inc") != "Rugosidad n", bl=True)

  def calc_inverso(self, w):
    tipo = w.sel("tipo")
    inc = w.sel("inc")
    Q = w.v("Q")
    y = w.v("y") if inc != "Tirante y" else None
    z = w.v("z", cero=True) if (tipo in ("Trapezoidal", "Triangular") and inc != "Talud lateral z") else 0.0
    b = w.v("b") if (tipo in ("Trapezoidal", "Rectangular") and inc != "Ancho de solera b") else 0.0
    d = w.v("d") if (tipo == "Circular" and inc != "Diámetro D") else 0.0
    S = w.v("S") if inc != "Pendiente S" else None
    n_de = w.rugosidad(tipo) if inc != "Rugosidad n" else None

    if inc == "Pendiente S":
      A, P, _ = geometria(tipo, y, b, z, d)
      n = n_de(y, b, z)
      S = (Q * n / (A * (A / P) ** (2 / 3))) ** 2
      principal = ("Pendiente requerida S", f"{S:.6f}", "m/m")
    elif inc == "Rugosidad n":
      A, P, _ = geometria(tipo, y, b, z, d)
      n = A * (A / P) ** (2 / 3) * math.sqrt(S) / Q
      principal = ("Rugosidad requerida n", f"{n:.5f}", "")
    elif inc == "Ancho de solera b":
      if tipo not in ("Trapezoidal", "Rectangular"):
        raise ValueError(f"La sección {tipo} no tiene ancho de solera b.")
      b = biseccion(
          lambda bb: caudal_manning(tipo, y, bb, z, 0, S, n_de(y, bb, z)) - Q,
          1e-4, 50.0)
      principal = ("Ancho de solera requerido b", f"{b:.4f}", "m")
    elif inc == "Talud lateral z":
      if tipo not in ("Trapezoidal", "Triangular"):
        raise ValueError(f"La sección {tipo} no tiene talud libre z.")
      z = biseccion(
          lambda zz: caudal_manning(tipo, y, b, zz, 0, S, n_de(y, b, zz)) - Q,
          0.0, 30.0)
      principal = ("Talud lateral requerido z", f"{z:.4f}", "")
    elif inc == "Diámetro D":
      if tipo != "Circular":
        raise ValueError(f"La sección {tipo} no tiene diámetro D.")
      d = biseccion(
          lambda dd: (caudal_manning("Circular", y, 0, 0, dd, S, n_de(y, 0, 0)) - Q) if dd >= y else -Q,
          y * 1.01, 50.0)
      principal = ("Diámetro requerido D", f"{d:.4f}", "m")
    else:  # Tirante y
      circ = tipo == "Circular"
      hi = 0.938 * d if circ else 50.0
      y = biseccion(
          lambda yy: caudal_manning(tipo, yy, b, z, d, S, n_de(yy, b, z)) - Q,
          1e-4, hi, expandir=not circ)
      principal = ("Tirante normal requerido y", f"{y:.4f}", "m")

    A, P, T = geometria(tipo, y, b, z, d)
    V = Q / A
    Fr = froude(V, A, T)
    fila_rug = [w.fila_n(n_de(y, b, z))] if inc != "Rugosidad n" else []
    return w.con_bl({
        "filas": [
            principal,
            ("Área hidráulica A", f"{A:.4f}", "m²"),
            ("Perímetro mojado P", f"{P:.4f}", "m"),
            ("Radio hidráulico R", f"{A / P:.4f}", "m"),
            ("Espejo de agua T", f"{T:.4f}", "m"),
            ("Velocidad media V", f"{V:.4f}", "m/s"),
            ("Número de Froude", f"{Fr:.4f} ({regimen(Fr)})", ""),
        ] + fila_rug,
        "dibujo": dict(tipo=tipo, y=y, b=b, z=z, d=d, etiqueta="y"),
    }, Q, b, y, tipo)

  # ==========================================================
  # 9. SECCIÓN COMPUESTA (CANAL + PLANICIES INDEPENDIENTES)
  # ==========================================================
  def abrir_compuesta(self):
    Ventana(self, "Sección compuesta",
            "Canal principal de cualquier forma con planicies de inundación asimétricas o independientes.",
            [("S", "Pendiente S", "0.001", "m/m"),
             ("Q", "Caudal Q", "20.0", "m³/s"),
             ("y", "Tirante total y", "2.0", "m"),
             ("hi", "Profundidad planicie izq. hi", "1.5", "m"),
             ("hd", "Profundidad planicie der. hd", "1.5", "m"),
             ("b", "Ancho de solera b", "4.0", "m"),
             ("z", "Talud del canal z", "1.0", ""),
             ("Bi", "Planicie izquierda Bi", "6.0", "m"),
             ("Bd", "Planicie derecha Bd", "8.0", "m"),
             ("zfi", "Talud exterior izq. zfi", "0.0", ""),
             ("zfd", "Talud exterior der. zfd", "0.0", ""),
             ("nc", "n del canal principal", "0.025", "", "cowan"),
             ("ni", "n planicie izquierda", "0.045", "", "cowan"),
             ("nd", "n planicie derecha", "0.045", "", "cowan")],
            self.calc_compuesta,
            selectores=SEL_CANAL + [
                ("modo", "Qué desea calcular",
                 ["Calcular el caudal Q", "Calcular el tirante y"],
                 "Calcular el caudal Q")],
            dibujo=True, habilitar=habilitar_compuesta, rug=True,
            rug_cfg={
                "simples": ["nc", "ni", "nd"],
                "horton": [("ncf", "n del fondo del canal", "0.015"),
                           ("nct", "n de los taludes del canal", "0.025"),
                           ("npf", "n del fondo de planicies", "0.035"),
                           ("npt", "n del talud exterior", "0.045")],
                "boton_unico": False,
            })

  def calc_compuesta(self, w):
    tipo = w.sel("tipo")
    calc_y = w.sel("modo").endswith("tirante y")
    horton = w.sel("rug").startswith("Compuesta")
    S = w.v("S")
    hi = w.v("hi")
    hd = w.v("hd")
    b = w.v("b") if tipo in ("Trapezoidal", "Rectangular") else 0.0
    if tipo == "Trapezoidal":
      z = w.v("z", cero=True)
    elif tipo == "Triangular":
      z = w.v("z")
    else:
      z = 0.0
    Bi, Bd = w.v("Bi"), w.v("Bd")
    zfi = w.v("zfi", cero=True)
    zfd = w.v("zfd", cero=True)
    if horton:
      rug = ("horton", w.v("ncf"), w.v("nct"), w.v("npf"), w.v("npt"))
    else:
      rug = ("simple", w.v("nc"), w.v("ni"), w.v("nd"))

    def evaluar(y):
      subs = subsecciones_compuesta(y, tipo, b, z, hi, hd, Bi, Bd, zfi, zfd, rug)
      return caudales_compuesta(subs, S) + (subs,)

    if calc_y:
      Q = w.v("Q")
      y = primera_raiz(lambda t: evaluar(t)[0] - Q, 1e-4, 100.0)
    else:
      y = w.v("y")

    Qt, qs, A, P, subs = evaluar(y)
    qi = qs[1] if len(qs) > 1 else 0.0
    qd = qs[2] if len(qs) > 2 else 0.0
    principal = (("Tirante total y", f"{y:.4f}", "m") if calc_y
                 else ("Caudal total Q", f"{Qt:.4f}", "m³/s"))
    eq = " equivalente" if horton else ""

    def fn(i):
      return f"{subs[i][3]:.5f}" if i < len(subs) else "—"

    nota = None
    h_min = min(hi, hd)
    if y <= h_min:
      nota = ("El tirante no supera la profundidad de las planicies: no hay"
              " desborde y el flujo ocurre solo en el canal principal.")
    elif y <= max(hi, hd):
      nota = "Flujo asimétrico: el agua ha desbordado una sola planicie."
    return {
        "filas": [
            principal,
            ("Caudal en el canal principal", f"{qs[0]:.4f}", "m³/s"),
            ("Caudal en la planicie izquierda", f"{qi:.4f}", "m³/s"),
            ("Caudal en la planicie derecha", f"{qd:.4f}", "m³/s"),
            ("Área total A", f"{A:.4f}", "m²"),
            ("Perímetro mojado P", f"{P:.4f}", "m"),
            ("Velocidad media V", f"{Qt / A:.4f}", "m/s"),
            (f"n{eq} del canal principal", fn(0), ""),
            (f"n{eq} de la planicie izquierda", fn(1), ""),
            (f"n{eq} de la planicie derecha", fn(2), ""),
        ],
        "nota": nota,
        "dibujo": dict(y=y, b=b, z=z, h=h_min, Bi=Bi, Bd=Bd, zf=(zfi + zfd) / 2.0, etiqueta="y", tipo=tipo),
        "dibujo_fn": dibujar_compuesta,
    }



HCanalesMasterApp = ElCaudaloso   # nombre anterior, por compatibilidad


class Splash:
  """Pantalla de presentación sin bordes que se muestra mientras carga el programa."""

  def __init__(self, root):
    self.v = tk.Toplevel(root)
    self.v.overrideredirect(True)
    w, h = 560, 320
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    self.v.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")
    clave = "#010203"
    self.v.configure(bg=clave)
    try:
      self.v.attributes("-topmost", True)
      self.v.attributes("-transparentcolor", clave)   # esquinas redondeadas (Windows)
    except tk.TclError:
      pass
    if HAY_PIL:
      self._foto = ImageTk.PhotoImage(render_splash(w, h))
      tk.Label(self.v, image=self._foto, bg=clave, bd=0).pack()
    else:
      tk.Label(self.v, text="EL CAUDALOSO", bg=SIDE_BG, fg="#FFFFFF", font=fnt(28, "bold"),
               width=22, height=5).pack()
    self._ancho = w - 96
    tk.Frame(self.v, bg="#1B4557", height=3).place(x=48, y=h - 22, width=self._ancho)
    self.barra = tk.Frame(self.v, bg=WATER, height=3)
    self.barra.place(x=48, y=h - 22, width=1)
    self.v.update()

  def animar(self, ms):
    pasos = max(5, ms // 20)

    def paso(i):
      try:
        self.barra.place_configure(width=max(1, int(self._ancho * _ease(i / pasos))))
      except tk.TclError:
        return
      if i < pasos:
        self.v.after(max(1, ms // pasos), paso, i + 1)

    paso(1)

  def cerrar(self):
    self.v.destroy()


def main():
  root = tk.Tk()
  root.withdraw()
  splash = Splash(root)
  t0 = time.time()
  app = ElCaudaloso(root)
  espera = max(0, 1800 - int((time.time() - t0) * 1000))
  splash.animar(espera)

  def abrir():
    splash.cerrar()
    try:
      root.attributes("-alpha", 0.0)
    except tk.TclError:
      pass
    root.deiconify()
    root.lift()
    app.anim.entrada(root)

  root.after(espera, abrir)
  root.mainloop()



if __name__ == "__main__":
  main()