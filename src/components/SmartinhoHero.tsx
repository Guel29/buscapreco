import React from 'react';

export const SmartinhoMascot: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative flex items-end justify-center select-none pointer-events-none ${className}`}>
      {/* Cartoon Energy Marks (green exclamation marks \ | /) */}
      <div className="absolute top-2 -right-2 md:top-4 md:right-2 flex gap-1 text-[#22f2b4] font-black text-xl md:text-2xl drop-shadow-[0_0_10px_rgba(34,242,180,0.8)]">
        <span className="inline-block transform -rotate-25">/</span>
        <span className="inline-block transform -rotate-10 -translate-y-1">|</span>
        <span className="inline-block transform rotate-20">\</span>
      </div>

      <svg
        viewBox="0 0 420 400"
        className="w-72 h-72 md:w-96 md:h-96 object-contain filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.7)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Skin Gradients */}
          <radialGradient id="skinGlow" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ffdfbe" />
            <stop offset="70%" stopColor="#f5be98" />
            <stop offset="100%" stopColor="#db9b72" />
          </radialGradient>
          <linearGradient id="skinShadow" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffdfbe" />
            <stop offset="100%" stopColor="#c88258" />
          </linearGradient>

          {/* Hair Gradients */}
          <linearGradient id="hairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3d2314" />
            <stop offset="40%" stopColor="#241309" />
            <stop offset="100%" stopColor="#150a04" />
          </linearGradient>
          <linearGradient id="hairHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#693e24" />
            <stop offset="100%" stopColor="#241309" />
          </linearGradient>

          {/* Red Polo Shirt */}
          <linearGradient id="redPolo" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef233c" />
            <stop offset="50%" stopColor="#d90429" />
            <stop offset="100%" stopColor="#8d0801" />
          </linearGradient>

          {/* Yellow Collar */}
          <linearGradient id="yellowCollar" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffe600" />
            <stop offset="60%" stopColor="#ffb703" />
            <stop offset="100%" stopColor="#fb8500" />
          </linearGradient>

          {/* Soft eye reflection */}
          <radialGradient id="eyeIris" cx="45%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#63391d" />
            <stop offset="75%" stopColor="#30190b" />
            <stop offset="100%" stopColor="#150b05" />
          </radialGradient>

          {/* Depth filter */}
          <filter id="shadowDepth" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodOpacity="0.4" />
          </filter>
        </defs>

        {/* --- BODY / RED POLO SHIRT --- */}
        <g id="body-torso" filter="url(#shadowDepth)">
          {/* Shoulders & Chest */}
          <path
            d="M80 340 C110 270, 160 250, 220 250 C280 250, 330 270, 360 340 C370 365, 365 395, 340 400 L95 400 C75 395, 70 365, 80 340 Z"
            fill="url(#redPolo)"
          />

          {/* Left/Right Arm Silhouettes */}
          {/* Right Arm (pointing down-left to input) */}
          <path
            d="M120 290 C90 320, 60 340, 45 365 C40 375, 45 385, 60 380 C80 370, 110 330, 135 305 Z"
            fill="#a5060d"
          />
          {/* Left Arm (pointing down-center to input) */}
          <path
            d="M320 290 C345 320, 375 340, 390 365 C395 375, 390 385, 375 380 C355 370, 325 330, 305 305 Z"
            fill="#a5060d"
          />

          {/* Smart O Varejão Badge / Logo on Left Chest */}
          <g id="smart-logo" transform="translate(255, 305)">
            <rect x="0" y="0" width="68" height="26" rx="5" fill="#c0041f" opacity="0.3" />
            <text x="3" y="14" fill="#ffffff" fontSize="13" fontWeight="900" fontFamily="sans-serif" letterSpacing="-0.5">
              Smart
            </text>
            <circle cx="48" cy="8" r="3" fill="#ffe600" />
            <text x="3" y="23" fill="#ffe600" fontSize="8" fontWeight="800" fontFamily="sans-serif" letterSpacing="0.2">
              O VAREJÃO
            </text>
          </g>

          {/* Yellow Polo Placket & Collar */}
          <path
            d="M195 248 L245 248 L235 315 L205 315 Z"
            fill="#c0041f"
          />
          {/* Collar Buttons */}
          <circle cx="220" cy="275" r="3" fill="#ffffff" opacity="0.9" />
          <circle cx="220" cy="298" r="3" fill="#ffffff" opacity="0.9" />

          {/* Left Collar Leaf */}
          <path
            d="M185 240 C175 270, 150 285, 140 285 C145 270, 160 250, 185 240 Z"
            fill="url(#yellowCollar)"
            filter="url(#shadowDepth)"
          />
          {/* Right Collar Leaf */}
          <path
            d="M255 240 C265 270, 290 285, 300 285 C295 270, 280 250, 255 240 Z"
            fill="url(#yellowCollar)"
            filter="url(#shadowDepth)"
          />
          {/* Collar Band */}
          <path
            d="M180 238 C205 255, 235 255, 260 238 C245 265, 195 265, 180 238 Z"
            fill="#d97706"
          />
        </g>

        {/* --- NECK --- */}
        <g id="neck">
          <path
            d="M195 200 L245 200 L240 250 C220 258, 210 258, 200 250 Z"
            fill="url(#skinShadow)"
          />
        </g>

        {/* --- HEAD & FACE --- */}
        <g id="head" filter="url(#shadowDepth)">
          {/* Ears */}
          {/* Left Ear */}
          <path
            d="M152 145 C135 145, 135 185, 155 185 C160 185, 162 170, 160 155 Z"
            fill="url(#skinShadow)"
          />
          <path d="M148 155 C142 155, 142 175, 152 175" stroke="#ba6c41" strokeWidth="2" strokeLinecap="round" />

          {/* Right Ear */}
          <path
            d="M288 145 C305 145, 305 185, 285 185 C280 185, 278 170, 280 155 Z"
            fill="url(#skinShadow)"
          />
          <path d="M292 155 C298 155, 298 175, 288 175" stroke="#ba6c41" strokeWidth="2" strokeLinecap="round" />

          {/* Main Face Shape */}
          <path
            d="M155 130 C155 70, 285 70, 285 130 C285 185, 265 235, 220 235 C175 235, 155 185, 155 130 Z"
            fill="url(#skinGlow)"
          />

          {/* Rosy Cheeks */}
          <ellipse cx="175" cy="172" rx="14" ry="8" fill="#f43f5e" opacity="0.25" />
          <ellipse cx="265" cy="172" rx="14" ry="8" fill="#f43f5e" opacity="0.25" />

          {/* Friendly Eyebrows */}
          <path
            d="M170 120 C180 110, 198 112, 204 122"
            stroke="#271308"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M270 120 C260 110, 242 112, 236 122"
            stroke="#271308"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* Big Expressive Cartoon Eyes */}
          {/* Left Eye */}
          <g id="left-eye">
            <ellipse cx="188" cy="142" rx="16" ry="20" fill="#ffffff" />
            <ellipse cx="189" cy="142" rx="11" ry="14" fill="url(#eyeIris)" />
            <circle cx="189" cy="142" r="7" fill="#000000" />
            {/* Eye reflections */}
            <circle cx="185" cy="136" r="4.5" fill="#ffffff" />
            <circle cx="193" cy="146" r="2" fill="#ffffff" opacity="0.8" />
            {/* Eyelid line */}
            <path d="M172 135 C180 126, 198 126, 206 135" stroke="#2c1507" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </g>

          {/* Right Eye */}
          <g id="right-eye">
            <ellipse cx="252" cy="142" rx="16" ry="20" fill="#ffffff" />
            <ellipse cx="251" cy="142" rx="11" ry="14" fill="url(#eyeIris)" />
            <circle cx="251" cy="142" r="7" fill="#000000" />
            {/* Eye reflections */}
            <circle cx="247" cy="136" r="4.5" fill="#ffffff" />
            <circle cx="255" cy="146" r="2" fill="#ffffff" opacity="0.8" />
            {/* Eyelid line */}
            <path d="M234 135 C242 126, 260 126, 268 135" stroke="#2c1507" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </g>

          {/* Cute Button Nose */}
          <path
            d="M214 162 C216 168, 224 168, 226 162"
            stroke="#be6c44"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />

          {/* Big Joyful Smile */}
          <path
            d="M182 178 C192 215, 248 215, 258 178 C242 188, 198 188, 182 178 Z"
            fill="#6d0918"
          />
          {/* Teeth */}
          <path
            d="M187 181 C200 190, 240 190, 253 181 C248 193, 192 193, 187 181 Z"
            fill="#ffffff"
          />
          {/* Tongue */}
          <path
            d="M205 204 C212 198, 228 198, 235 204 C228 212, 212 212, 205 204 Z"
            fill="#f43f5e"
          />
          {/* Lip line */}
          <path
            d="M178 178 C195 190, 245 190, 262 178"
            stroke="#b45309"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* --- STYLED 3D PIXAR HAIR --- */}
        <g id="hair" filter="url(#shadowDepth)">
          {/* Voluminous Back & Top Swoop Hair */}
          <path
            d="M150 125 C135 90, 160 40, 210 32 C265 24, 305 55, 300 95 C305 105, 305 125, 290 140 C280 120, 275 95, 250 85 C230 78, 210 85, 190 92 C170 98, 155 110, 150 125 Z"
            fill="url(#hairGrad)"
          />

          {/* Front Quiff / Wave */}
          <path
            d="M180 85 C200 50, 250 45, 270 70 C280 82, 275 100, 260 108 C240 95, 215 92, 180 85 Z"
            fill="url(#hairHighlight)"
          />
          <path
            d="M145 115 C140 100, 155 80, 175 75 C165 90, 160 105, 155 125 Z"
            fill="#271308"
          />

          {/* Sideburns */}
          <path d="M156 128 L154 155 L164 140 Z" fill="#241309" />
          <path d="M284 128 L286 155 L276 140 Z" fill="#241309" />
        </g>

        {/* --- POINTING HANDS (Pointing down to the search bar) --- */}
        <g id="pointing-hands" filter="url(#shadowDepth)">
          {/* Right Hand / Fingers Pointing Down */}
          <g transform="translate(60, 310)">
            {/* Hand base */}
            <circle cx="45" cy="30" r="18" fill="url(#skinGlow)" />
            {/* Curled fingers */}
            <rect x="36" y="24" width="16" height="12" rx="5" fill="#e59866" />
            <rect x="34" y="34" width="16" height="11" rx="5" fill="#e59866" />
            {/* Thumb */}
            <path d="M28 22 C32 15, 42 16, 46 24" stroke="#db8452" strokeWidth="6" strokeLinecap="round" />
            {/* Index Finger Extended Straight Down */}
            <path
              d="M48 30 L48 68 C48 74, 38 74, 38 68 L38 34"
              fill="url(#skinGlow)"
              stroke="#ca6b35"
              strokeWidth="1.5"
            />
          </g>

          {/* Left Hand / Fingers Pointing Down */}
          <g transform="translate(305, 310)">
            {/* Hand base */}
            <circle cx="15" cy="30" r="18" fill="url(#skinGlow)" />
            {/* Curled fingers */}
            <rect x="8" y="24" width="16" height="12" rx="5" fill="#e59866" />
            <rect x="10" y="34" width="16" height="11" rx="5" fill="#e59866" />
            {/* Thumb */}
            <path d="M32 22 C28 15, 18 16, 14 24" stroke="#db8452" strokeWidth="6" strokeLinecap="round" />
            {/* Index Finger Extended Straight Down */}
            <path
              d="M12 30 L12 68 C12 74, 22 74, 22 68 L22 34"
              fill="url(#skinGlow)"
              stroke="#ca6b35"
              strokeWidth="1.5"
            />
          </g>
        </g>
      </svg>
    </div>
  );
};

export const SmartinhoKioskHeader: React.FC<{
  onConsultClick?: () => void;
}> = () => {
  return (
    <div className="relative w-full max-w-6xl mx-auto overflow-hidden rounded-3xl bg-gradient-to-r from-black via-neutral-950/95 to-neutral-900 border border-neutral-800/80 shadow-2xl p-4 md:p-8 flex flex-col md:flex-row items-center justify-between min-h-[260px] md:min-h-[300px]">
      {/* Background Ambience: Supermarket Shelves Bokeh & Cart Illustration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
        {/* Soft bokeh lights mimicking supermarket aisle */}
        <div className="absolute -left-10 -top-10 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl" />
        <div className="absolute left-1/4 top-1/2 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl" />
        <div className="absolute right-10 bottom-0 w-80 h-80 bg-red-600/10 rounded-full blur-3xl" />

        {/* Supermarket Shelves abstract vertical lines */}
        <div className="absolute left-4 inset-y-0 w-48 flex gap-3 opacity-20">
          <div className="w-1 bg-gradient-to-b from-neutral-600 via-amber-400 to-transparent" />
          <div className="w-1 bg-gradient-to-b from-neutral-500 via-red-500 to-transparent" />
          <div className="w-1 bg-gradient-to-b from-neutral-700 via-emerald-400 to-transparent" />
        </div>
      </div>

      {/* LEFT SECTION: Neon Barcode Logo + "CONSULTE O PREÇO Aqui no terminal" */}
      <div className="relative z-10 flex items-center gap-5 md:gap-7 self-center md:self-auto py-2">
        {/* Glowing Neon Barcode Scanner Icon Box */}
        <div className="relative shrink-0">
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-neutral-950/90 border-2 border-[#22f2b4] flex items-center justify-center shadow-[0_0_35px_rgba(34,242,180,0.45)] relative overflow-hidden group">
            {/* Glowing Corner Brackets */}
            <div className="absolute top-2.5 left-2.5 w-4 h-4 border-t-2 border-l-2 border-[#22f2b4]" />
            <div className="absolute top-2.5 right-2.5 w-4 h-4 border-t-2 border-r-2 border-[#22f2b4]" />
            <div className="absolute bottom-2.5 left-2.5 w-4 h-4 border-b-2 border-l-2 border-[#22f2b4]" />
            <div className="absolute bottom-2.5 right-2.5 w-4 h-4 border-b-2 border-r-2 border-[#22f2b4]" />

            {/* Barcode Lines */}
            <div className="flex items-center gap-1 md:gap-1.5 h-12 md:h-16 px-3">
              <span className="w-1.5 h-full bg-white rounded-full drop-shadow-[0_0_8px_#ffffff]" />
              <span className="w-0.5 h-full bg-white/80" />
              <span className="w-2.5 h-full bg-white rounded-full drop-shadow-[0_0_8px_#ffffff]" />
              <span className="w-1 h-full bg-white/70" />
              <span className="w-0.5 h-full bg-white/90" />
              <span className="w-2 h-full bg-white rounded-full drop-shadow-[0_0_8px_#ffffff]" />
              <span className="w-1.5 h-full bg-white" />
              <span className="w-0.5 h-full bg-white/60" />
              <span className="w-2 h-full bg-white rounded-full drop-shadow-[0_0_8px_#ffffff]" />
            </div>

            {/* Pulsing red laser scan line */}
            <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent top-1/2 -translate-y-1/2 animate-bounce opacity-85 shadow-[0_0_12px_#ef4444]" />
          </div>
        </div>

        {/* Title Typography: CONSULTE O PREÇO Aqui no terminal */}
        <div className="flex flex-col text-left">
          <span className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter leading-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
            CONSULTE
          </span>
          <span className="text-5xl md:text-7xl font-black text-[#22f2b4] uppercase tracking-tighter leading-none mt-1 drop-shadow-[0_0_30px_rgba(34,242,180,0.7)]">
            O PREÇO
          </span>
          <div className="relative mt-2">
            <span className="font-serif italic text-2xl md:text-3xl text-white font-medium tracking-normal drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
              Aqui no terminal
            </span>
            {/* Mint Underline Swoosh */}
            <div className="h-1 w-36 md:w-48 bg-gradient-to-r from-[#22f2b4] via-[#22f2b4]/80 to-transparent rounded-full mt-0.5 shadow-[0_0_10px_#22f2b4]" />
          </div>
        </div>
      </div>

      {/* RIGHT SECTION: Smartinho Mascot */}
      <div className="relative z-10 shrink-0 mt-4 md:mt-0 flex items-end justify-center">
        <SmartinhoMascot />
      </div>
    </div>
  );
};

export const SupermarketKioskBackdrop: React.FC<{ customImage?: string | null }> = ({ customImage }) => {
  if (customImage) {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <img
          src={customImage}
          alt="Fundo Terminal"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/45" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-gradient-to-br from-[#061019] via-[#050b12] to-[#03070a]">
      {/* LEFT SIDE: Supermarket Aisle with Shelves & Bokeh */}
      <div className="absolute left-0 top-0 bottom-0 w-[45%] overflow-hidden opacity-90">
        {/* Soft blur ceiling lights in perspective */}
        <div className="absolute -top-12 left-10 w-80 h-44 bg-amber-200/20 rotate-15 blur-2xl" />
        <div className="absolute top-20 left-4 w-60 h-16 bg-white/15 rotate-15 blur-xl" />
        <div className="absolute top-44 left-2 w-56 h-14 bg-emerald-400/10 rotate-15 blur-xl" />

        {/* Shelves & Products Bokeh */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/25 via-slate-900/20 to-transparent" />

        {/* Abstract product colors on shelves */}
        <div className="absolute top-20 left-4 flex flex-col gap-6 opacity-75">
          <div className="flex gap-2.5">
            <span className="w-5 h-20 bg-red-500 rounded-sm shadow-[0_0_10px_rgba(239,68,68,0.4)]" />
            <span className="w-6 h-22 bg-amber-400 rounded-sm shadow-[0_0_10px_rgba(251,191,36,0.4)]" />
            <span className="w-5 h-16 bg-emerald-500 rounded-sm shadow-[0_0_10px_rgba(16,185,129,0.4)]" />
            <span className="w-5 h-20 bg-blue-500 rounded-sm shadow-[0_0_10px_rgba(59,130,246,0.4)]" />
            <span className="w-6 h-18 bg-yellow-300 rounded-sm shadow-[0_0_10px_rgba(253,224,71,0.4)]" />
          </div>
          <div className="flex gap-2.5">
            <span className="w-6 h-18 bg-orange-500 rounded-sm" />
            <span className="w-5 h-20 bg-red-600 rounded-sm" />
            <span className="w-5 h-16 bg-yellow-400 rounded-sm" />
            <span className="w-7 h-22 bg-emerald-400 rounded-sm" />
          </div>
          <div className="flex gap-2.5">
            <span className="w-5 h-20 bg-purple-500 rounded-sm" />
            <span className="w-6 h-20 bg-cyan-500 rounded-sm" />
            <span className="w-5 h-16 bg-red-500 rounded-sm" />
          </div>
        </div>
      </div>

      {/* LOWER-LEFT FOREGROUND: Supermarket Shopping Cart with Groceries */}
      <div className="absolute -bottom-4 -left-6 md:left-4 md:bottom-2 w-84 md:w-[26rem] z-0 opacity-95">
        <svg viewBox="0 0 340 280" className="w-full h-auto filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)]" fill="none">
          {/* Groceries inside the cart */}
          {/* Yellow mustard/oil bottle */}
          <rect x="75" y="110" width="30" height="58" rx="6" fill="#facc15" stroke="#eab308" strokeWidth="1.5" />
          <rect x="83" y="98" width="14" height="15" rx="3" fill="#ca8a04" />
          <circle cx="90" cy="95" r="5" fill="#ef4444" />

          {/* Green 2L soda bottle */}
          <rect x="110" y="100" width="34" height="70" rx="8" fill="#22c55e" stroke="#16a34a" strokeWidth="1.5" />
          <rect x="120" y="86" width="14" height="16" rx="2" fill="#15803d" />
          <circle cx="127" cy="83" r="5" fill="#fde047" />

          {/* Red cereal/snack box */}
          <rect x="35" y="125" width="45" height="65" rx="4" fill="#ef4444" stroke="#dc2626" strokeWidth="1.5" />
          <rect x="42" y="135" width="30" height="16" rx="2" fill="#fef08a" opacity="0.9" />

          {/* Blue detergent/milk pack */}
          <rect x="70" y="145" width="50" height="50" rx="4" fill="#3b82f6" stroke="#2563eb" strokeWidth="1.5" />

          {/* Wire Mesh of Shopping Cart */}
          <path d="M20 150 L190 145 L175 225 L35 225 Z" stroke="#cbd5e1" strokeWidth="2.5" fill="none" opacity="0.9" />
          {/* Vertical wires */}
          <path d="M40 150 L48 225 M65 149 L70 225 M90 148 L93 225 M115 147 L115 225 M140 146 L138 225 M165 145 L158 225" stroke="#e2e8f0" strokeWidth="1.5" opacity="0.8" />
          {/* Horizontal wires */}
          <path d="M25 165 L186 161 M28 185 L182 181 M31 205 L178 201" stroke="#e2e8f0" strokeWidth="1.5" opacity="0.8" />

          {/* Cart Frame & Wheels Chassis */}
          <path d="M35 225 L175 225 L150 255 L55 255 Z" stroke="#94a3b8" strokeWidth="4" fill="none" />
          {/* Front wheel */}
          <circle cx="145" cy="265" r="9" fill="#0f172a" stroke="#e2e8f0" strokeWidth="2" />
          {/* Rear wheel */}
          <circle cx="65" cy="265" r="9" fill="#0f172a" stroke="#e2e8f0" strokeWidth="2" />

          {/* Cart Red Plastic Handle Bar & Bumpers */}
          <path d="M175 145 L205 130" stroke="#cbd5e1" strokeWidth="5" strokeLinecap="round" />
          <rect x="195" y="120" width="35" height="14" rx="7" fill="#ef4444" stroke="#b91c1c" strokeWidth="1.5" />
          <circle cx="230" cy="127" r="7" fill="#dc2626" />
        </svg>
      </div>

      {/* RIGHT SIDE: Glowing Curved Neon Green Arch & Refrigerator Coolers */}
      <div className="absolute right-0 top-0 bottom-0 w-[45%] overflow-hidden">
        {/* Refrigerator drinks shelves backdrop */}
        <div className="absolute right-0 inset-y-0 w-80 bg-slate-950/70 border-l border-emerald-500/20 flex flex-col justify-around py-8 px-6 opacity-85">
          {[1, 2, 3, 4].map((shelf) => (
            <div key={shelf} className="flex gap-2.5 items-end justify-end border-b border-slate-800/80 pb-1.5">
              <span className="w-5 h-18 bg-amber-400 rounded-xs shadow-[0_0_8px_rgba(251,191,36,0.3)]" />
              <span className="w-5 h-20 bg-red-500 rounded-xs shadow-[0_0_8px_rgba(239,68,68,0.3)]" />
              <span className="w-6 h-22 bg-emerald-400 rounded-xs shadow-[0_0_8px_rgba(52,211,153,0.3)]" />
              <span className="w-5 h-18 bg-blue-400 rounded-xs shadow-[0_0_8px_rgba(96,165,250,0.3)]" />
              <span className="w-5 h-20 bg-yellow-300 rounded-xs shadow-[0_0_8px_rgba(253,224,71,0.3)]" />
              <span className="w-6 h-22 bg-red-600 rounded-xs shadow-[0_0_8px_rgba(220,38,38,0.3)]" />
            </div>
          ))}
        </div>

        {/* Huge Curved Glowing Neon Green Arch */}
        <svg
          viewBox="0 0 400 800"
          className="absolute -right-10 inset-y-0 h-full w-auto select-none pointer-events-none"
          fill="none"
        >
          <defs>
            <filter id="neonGreenGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="12" result="blur1" />
              <feGaussianBlur stdDeviation="24" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Deep green ambient aura */}
          <path
            d="M380 -50 C120 180, 100 620, 380 850"
            stroke="#10b981"
            strokeWidth="32"
            opacity="0.3"
            filter="url(#neonGreenGlow)"
          />
          {/* Main Glowing Neon Arch Ring */}
          <path
            d="M380 -50 C120 180, 100 620, 380 850"
            stroke="#22f2b4"
            strokeWidth="14"
            opacity="0.95"
            filter="url(#neonGreenGlow)"
          />
          {/* Inner Bright White Core */}
          <path
            d="M380 -50 C120 180, 100 620, 380 850"
            stroke="#ffffff"
            strokeWidth="4"
            opacity="0.95"
          />
        </svg>
      </div>

      {/* Subtle Ambient Vignette (Soft & Pleasant, allows background to shine through) */}
      <div className="absolute inset-0 bg-radial from-transparent via-black/15 to-black/50" />
    </div>
  );
};
