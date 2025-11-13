(async ()=>{
    let editMode = false;
    let score = 0;
    let combo = 0;
    let adrenaline_meter = 0;
    let adrenaline = 1; // adrenaline == 1 means no adrenaline, 2 means adrenaline
    let recordedNotes = [];
    let holdStartTimes = {};
    const toSpark = {0:0,1:0,2:0,3:0,4:0};
    const keysDown = {};
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const lanes = 5;
    const laneWidth = canvas.width / lanes;
    const hitY = canvas.height - 100;
    const scrollSpeed = 400;
    const lookahead = 1.5;
    
    const windowPerfect = 55;
    const windowGreat = 110;
    const windowGood = 175;
    let countdown = false;
    let judgement = '';
    const laneActive = [false, false, false, false, false];
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const mapResponse = await fetch(urlParams.get('song'));
    const map = await mapResponse.json();
    const pixelsPerSecond = scrollSpeed * (map.bpm/100);
    const barFill = document.getElementById("barFill");
    let percent = 0;

    function setBar(percentValue) {
    percent = Math.max(0, Math.min(100, percentValue));
    barFill.style.height = percent + "%";
    }


    const audioContext = new window.AudioContext();
    let audioBuffer, audioStartTime = 0;
    const fetchAudio = async (url) =>
    {
        const r = await fetch(url);
        const ab = await r.arrayBuffer();
        return await audioContext.decodeAudioData(ab)
    };
    audioBuffer = await fetchAudio(map.audio);

    const notes = map.notes.map(n =>( {
        ...n,
        hit: false,
        judged: false,
        holding: false,
        released: false,
        endTime: n.type === 'hold' ? n.time + n.duration : n.time,
        hold_success: false
    }));

    function playSong() {
        const src = audioContext.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(audioContext.destination);
        audioStartTime = audioContext.currentTime + 0.2;
        src.start(audioStartTime);
        currentsrc = src
    }

    const keyMap = {'a': 0, 's': 1, 'j': 2, 'k':3,'l':4};
    window.addEventListener('keydown', (e) =>{
        const key = e.key.toLowerCase();
        if (keysDown[key]) return;
        
        if (key == ' ') {
            
            if (!audioStartTime && !countdown) {
                let i = 5;
                
                const interval = setInterval(() => {
                countdown = i;
                

                i--;
                if (i === 0) {
                    clearInterval(interval);
                    if (audioContext.state === 'suspended') audioContext.resume();
                    playSong();
                    countdown = false;
                }
                }, 1000);
                
            }
            return;
        }
        if (editMode && e.key === 'Enter') {
            const chart = {
                audio: map.audio || 'song.mp3',
                notes: recordedNotes.sort((a, b) => a.time - b.time)
            };
            console.log('--- CHART JSON ---');
            console.log(JSON.stringify(chart, null, 2));
        }
        if (!(key in keyMap)) {e.preventDefault; return;}
        keysDown[key] = true;
        const lane = keyMap[key];
        if (editMode && audioStartTime) {
            const now = audioContext.currentTime - audioStartTime;
            if (!holdStartTimes[lane]) {
                holdStartTimes[lane] = now;
            }
        }
        
        

        
        laneActive[lane] = true;
        handleHit(lane);
    });
    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (!(k in keyMap)) return;
        keysDown[k] = false;
        const lane = keyMap[k];
        laneActive[lane] = false;
        if (editMode && audioStartTime) {
        const now = audioContext.currentTime - audioStartTime;

        if (holdStartTimes[lane] !== undefined) {
            const start = holdStartTimes[lane];
            const duration = now - start;

            if (duration < 0.15) {
                recordedNotes.push({
                    time: parseFloat(start.toFixed(3)),
                    type: 'tap',
                    lane: lane
                });
            } else {
                recordedNotes.push({
                    time: parseFloat(start.toFixed(3)),
                    type: 'hold',
                    lane: lane,
                    duration: parseFloat(duration.toFixed(3))
                });
            }

            delete holdStartTimes[lane];
            console.log('Recorded note:', recordedNotes[recordedNotes.length - 1]);
        }
        }
        
        

        if (!audioStartTime) return;

        
        const activeHold = notes
            .filter(n => n.type === 'hold' && n.holding && !n.released)
            .filter(n => (n.lane === lane) ) 
            .sort((a, b) => a.endTime - b.endTime)[0]; 

        if (!activeHold) {

            return;
        }

        const now = audioContext.currentTime - audioStartTime;
        activeHold.released = true;
        activeHold.holding = false;


        const releaseGrace = 0.20; 
        if (now < activeHold.endTime - releaseGrace || now > activeHold.endTime + releaseGrace) {
            console.log('missed');
            judgement = 'Miss'
            activeHold.hit = false;
            combo = 0; 
            adrenaline_meter -= adrenaline === 2 ? 100 : 0; 
        } else {
            console.log('success');
            if (now - activeHold.endTime > 0.13 || now - activeHold.endTime < -0.13){ judgement = 'Good'; score += 1 * adrenaline; adrenaline_meter += adrenaline === 1 ? 1 : -2;}
            else if (now - activeHold.endTime > 0.071 || now-activeHold.endTime < -0.071) { judgement = 'Great'; score += 3 * adrenaline; adrenaline_meter += adrenaline === 1 ? 1 : -2;}
            else {judgement = 'Perfect'; score += 5 * adrenaline; adrenaline_meter += adrenaline === 1 ? 1 : -2;};
            activeHold.hit = true;
            activeHold.hold_success = true;
            score += Math.round(2 * activeHold.duration/ 10)
        }
    });
    
    function handleHit(lane) {
        const now = audioContext.currentTime - audioStartTime;
        const candidates = notes
        .filter(n => !n.judged && n.lane === lane)
        .map(n => ({n, dt: (n.time - now) * 1000 })) 
        .filter(x => Math.abs(x.dt) <= windowGood)
        .sort((a,b) => Math.abs(a.dt) - Math.abs(b.dt));
        if (candidates.length === 0) {
            toSpark[lane] = false;
        return;
        }
        const best = candidates[0];
        const absDt = Math.abs(best.dt);
        judgement = 'Miss';
        if (absDt <= windowPerfect) {judgement = 'Perfect'; combo += 1; score += 5 * adrenaline ; adrenaline_meter += adrenaline === 1 ? 1 : -2;}
        else if (absDt <= windowGreat) {judgement = 'Great'; combo += 1; score += 3 * adrenaline; adrenaline_meter += adrenaline === 1 ? 1 : -2; }
        else if (absDt <= windowGood) {judgement = 'Good'; combo += 1; score += 1 * adrenaline; adrenaline_meter += adrenaline === 1 ? 1 : -2; }
        if (best.n.type === 'tap') {
            best.n.judged = true;
            best.n.hit = absDt <= windowGood;
        }

        if (best.n.type === 'hold') {
            best.n.hit = absDt <= windowGood;
            best.n.holding = best.n.hit;
            best.n.judged = best.n.hit; 
            best.n.holdStartTime = now;
        }
        let color;
        switch (judgement) {
        case 'Perfect': color = 'rgba(11, 157, 224, 1)'; break;
        case 'Great'  : color = 'rgba(23, 181, 70, 1)'; break;
        case 'Good'   : color = 'rgba(194, 176, 38, 1)'; break;
        case 'Miss'   : color = 'rgba(224, 11, 11, 1)'; break;
        default: color = '#fff';
        }
        if (judgement != 'Miss') {
            console.log('spoarj');
            toSpark[lane] = true;
        }

        startPop(judgement, color, canvas.width / 2 - 50, 100);
        
        
        console.log('Judged', judgement, 'dt', Math.round(best.dt));
  }


        // ---- Pop effect (robust) ----
    const popEffect = {
    active: false,
    start: 0,
    duration: 400,
    maxScale: 1.6,
    text: '',
    color: '#fff',
    font: '32px sans-serif',
    x: 0,
    y: 0
    };

    function startPop(text, color, x, y, opts = {}) {
    popEffect.active = true;
    popEffect.start = performance.now();
    popEffect.text = text;
    popEffect.color = color || popEffect.color || '#fff';
    popEffect.x = x;
    popEffect.y = y;
    if (opts.duration != null) popEffect.duration = opts.duration;
    if (opts.maxScale != null) popEffect.maxScale = opts.maxScale;
    if (opts.font) popEffect.font = opts.font;
    }

    function drawPop(ctx) {
    if (!popEffect.active) return;

    const now = performance.now();
    const elapsed = now - popEffect.start;
    const progress = Math.min(elapsed / popEffect.duration, 1);
    const scale = 1 + Math.sin(progress * Math.PI) * (popEffect.maxScale - 1);

    ctx.save();
    ctx.font = popEffect.font;

    const metrics = ctx.measureText(popEffect.text);
    const textWidth = metrics.width;

    
    const fontSizeMatch = popEffect.font.match(/(\d+)px/);
    const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1], 10) : 32;
    const textHeight = fontSize; 


    const centerX = popEffect.x + textWidth / 2;
    const centerY = popEffect.y; 

    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = popEffect.color || '#fff';
    ctx.font = popEffect.font; 
    ctx.fillText(popEffect.text, 0, 0);

    ctx.restore();

    if (progress >= 1) popEffect.active = false;
    }
    function drawSparks(ctx, x, y, radius, count = 8) {
           const flareY = y - radius * 0.7;
            const flareHeight = radius * 1.3;      
            const flareWidth = radius * 0.8;       

            // --- CORE GLOW COLUMN ---
            const grad = ctx.createLinearGradient(x, flareY, x, flareY - flareHeight);
            grad.addColorStop(0.0, 'rgba(255, 255, 180, 0.9)');
            grad.addColorStop(0.2, 'rgba(255, 180, 80, 0.8)');
            grad.addColorStop(0.5, 'rgba(255, 80, 10, 0.6)');
            grad.addColorStop(1.0, 'rgba(60, 0, 0, 0)');

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = grad;
            ctx.fillRect(x - flareWidth / 2, flareY - flareHeight, flareWidth, flareHeight);

            // --- FLICKERING FLAME STREAKS ---
            const flameSpread = flareWidth * 0.6;  
            for (let i = 0; i < 10; i++) {       
                const offsetX = (Math.random() - 0.5) * flameSpread;
                const jitter = (Math.random() - 0.5) * radius * 0.2;
                const height = flareHeight * (0.8 + Math.random() * 0.4);
                ctx.beginPath();
                ctx.moveTo(x + offsetX, flareY + jitter);
                ctx.lineTo(x + offsetX + (Math.random() - 0.5) * 15, flareY - height);
                ctx.strokeStyle = `rgba(255, ${100 + Math.random() * 100}, 0, ${0.3 + Math.random() * 0.5})`;
                ctx.lineWidth = 2 + Math.random() * 3;
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'rgba(255, 100, 0, 1)';
                ctx.stroke();
            }
            ctx.restore();

            
}

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const millis = Math.floor((seconds % 1) * 1000);

        const m = minutes.toString().padStart(2, '0');
        const s = secs.toString().padStart(2, '0');
        const ms = millis.toString().padStart(3, '0');

        return `${m}:${s}.${ms}`;
    }

    function draw() {
    setBar(adrenaline_meter > 0 ? (adrenaline_meter/300) * 100 : 0 )
    document.getElementById("score").textContent = "Score: "+score;
    document.getElementById("combo").textContent = "Combo: x"+combo;
    document.getElementById("time").textContent = formatTime(audioContext.currentTime - audioStartTime);
    const barContainer = document.getElementById("barContainer");
    if (adrenaline_meter >= 300) {
        adrenaline = 2;
        barContainer.classList.add("glow");
    }
    else if (adrenaline_meter < 1) {
        adrenaline = 1;
        barContainer.classList.remove("glow");
    }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    
    for (let i = 0; i < lanes; i++) {
       
        ctx.fillStyle = '#222';
        ctx.fillRect(i * laneWidth, 0, laneWidth, canvas.height);

        
        
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#333';
        ctx.strokeRect(i * laneWidth, 0, laneWidth, canvas.height);
    }
    // draw hit line
    ctx.fillStyle = '#444';
    ctx.fillRect(0, hitY, canvas.width, 6);
    var lane_colors = ['rgba(41, 144, 22, 1)', 'rgba(144, 26, 22, 1)','rgba(165, 154, 24, 1)','rgba(22, 55, 144, 1)',  'rgba(170, 100, 25, 1)', 'rgba(41, 212, 212, 1)']
    
    
        
    
    if (countdown) {
                ctx.fillStyle = '#fff';
                ctx.font = '20px sans-serif';
                ctx.fillText(countdown-1, 120, canvas.height / 2);
    }
    else if (!audioStartTime && !countdown) {
      ctx.fillStyle = '#fff';
      ctx.font = '20px sans-serif';
      ctx.fillText('Press SPACE to start', 120, canvas.height/2);
    } else {
      
      const now = audioContext.currentTime;
      const songTime = now - audioStartTime; 
      // miss detection
        for (const note of notes) {
            if (note.judged) continue;

            const dt = (songTime - note.time) * 1000;

            if (dt > windowGood) {
                note.judged = true;
                note.hit = false;
                judgement = 'Miss';
                combo = 0 ; 
                adrenaline_meter -= adrenaline === 2 ? 100 : 0; 
                startPop(judgement, 'rgba(224, 11, 11, 1)', canvas.width / 2 - 50, 100);
            }
            
            
        }
      // render notes within lookahead
      for (const note of notes) {

        const dt = note.time - songTime;
        const endDt = note.endTime - songTime;
        if (endDt < -1) continue;                 
        if (dt > lookahead) continue;       
        const yStart = hitY - dt * pixelsPerSecond;
        const yEnd = hitY - endDt * pixelsPerSecond;
        const x = note.lane * laneWidth + laneWidth/2;

        if (note.type === 'tap') {
            ctx.beginPath();
            ctx.fillStyle = note.judged ? (note.hit ? 'rgba(0, 255, 0, 0)' : '#900') : adrenaline === 2 ? 'rgba(41, 212, 212, 1)' :
            (note.lane === 0 ?'rgba(41, 144, 22, 1)' : 
                (note.lane === 1 ? 'rgba(144, 26, 22, 1)' :
                    note.lane === 2 ? 'rgba(165, 154, 24, 1)' : note.lane === 3 ? 'rgba(22, 55, 144, 1)' : 'rgba(170, 100, 25, 1)'
                    
                ));
            
            ctx.arc(x, yStart, Math.min(24, 16 + (1 - Math.min(1, dt/lookahead))*12), 0, Math.PI*2);
            
            ctx.fill();
            ctx.save();
            
            ctx.clip();
            ctx.lineWidth = 4;
            ctx.strokeStyle = note.judged ? (note.hit ? 'rgba(0,0,0,0)' : 'rgba(0, 0, 0, 1)') : 'rgba(0, 0, 0, 1)';
            ctx.stroke();
            ctx.restore();
      }
        if (note.type === 'hold') {
            const progressTime = Math.max(0, Math.min(songTime - note.time, note.duration));
            const progressRatio = progressTime / note.duration;

            let tailStartY = yStart;

            if (note.holding) {
                if (progressRatio > 0.98) { tailStartY = yEnd }
                else {
                tailStartY = hitY - ( progressTime ) * progressRatio/ pixelsPerSecond;
                }

            }

            ctx.beginPath();
            ctx.strokeStyle = note.holding ? 'rgba(0, 255, 0, 0.5)' : (!note.released ? adrenaline === 2 ? 'rgba(41, 212, 212, 1)' : (note.lane === 0 ?'rgba(41, 144, 22, 1)' : 
                (note.lane === 1 ? 'rgba(144, 26, 22, 1)' :
                    note.lane === 2 ? 'rgba(165, 154, 24, 1)' : note.lane === 3 ? 'rgba(22, 55, 144, 1)' : 'rgba(170, 100, 25, 1)'
                    
                )) : 'rgba(0,0,0,0)');
            ctx.lineWidth = 14;
            ctx.moveTo(x, tailStartY);
            ctx.lineTo(x, yEnd);
            ctx.stroke();

            if (!note.holding) {
                ctx.beginPath();
                ctx.fillStyle = note.judged ? (note.hit ? 'rgba(0, 255, 0, 0)' : '#900') : adrenaline === 2 ? 'rgba(41, 212, 212, 1)' : (note.lane === 0 ?'rgba(41, 144, 22, 1)' : 
                (note.lane === 1 ? 'rgba(144, 26, 22, 1)' :
                    note.lane === 2 ? 'rgba(165, 154, 24, 1)' : note.lane === 3 ? 'rgba(22, 55, 144, 1)' : 'rgba(170, 100, 25, 1)'
                    
                ));;
                
                ctx.arc(x, yStart, 20, 0, Math.PI * 2);
                ctx.fill();
                ctx.save();
                
                ctx.clip();
                ctx.lineWidth = 4;
                ctx.strokeStyle = note.judged ? (note.hit ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)') : 'rgba(0,0,0,1)';
                ctx.stroke();
                ctx.restore();
            }

            
            
            ctx.beginPath();
            ctx.arc(x, yEnd, 10, 0, Math.PI * 2);
            ctx.fillStyle = note.hold_success ? 'rgba(0, 102, 102, 0)' : 'rgba(0, 102, 102, 1)';
            ctx.fill();
            
    }
    }
    
    drawPop(ctx);
    }
    for (var i = 0; i < lanes; i++) {
        
        const x = (canvas.width / 5) * i + 45;
        const y = hitY;
        const radius = 28;
        
        ctx.save();
        
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(36, 36, 36, 1)';
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        

       

        ctx.beginPath();
        ctx.lineWidth = 12;
        ctx.strokeStyle = adrenaline == 1 ? lane_colors[i] : lane_colors[5];
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        if (laneActive[i]) {
            if (toSpark[i]) {
                drawSparks(ctx,x,y, radius,15);
            }
            ctx.beginPath();
            ctx.arc(x, y - 5, radius - 10, 0, Math.PI * 2); 
            ctx.lineWidth = 6;
            ctx.strokeStyle = 'rgba(80, 80, 80, 1)';
            ctx.stroke();
            ctx.beginPath()
            ctx.fillStyle = adrenaline == 1 ? lane_colors[i] : lane_colors[5];
            ctx.arc(x, y - 8, radius - 10, 0, Math.PI * 2)
            ctx.fill();
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.globalAlpha = 1.0;
            
            
        }
    }
    requestAnimationFrame(draw);
  }

  draw();

})();