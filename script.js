(async ()=>{
    let editMode = false;
    let recordedNotes = [];
    let holdStartTimes = {};
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const lanes = 5;
    const laneWidth = canvas.width / lanes;
    const hitY = canvas.height - 100;
    const scrollSpeed = 400;
    const lookahead = 1.5;
    
    const windowPerfect = 50;
    const windowGreat = 100;
    const windowGood = 140;
    let countdown = false;
    let judgement = '';
    const laneActive = [false, false, false, false, false];
    const mapResponse = await fetch('still_into_you.json');
    const map = await mapResponse.json();
    const pixelsPerSecond = scrollSpeed * (map.bpm/100);



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
        if (!(key in keyMap)) return;
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
            .filter(n => (n.lane === lane) || (n.lane === lane + 1)) 
            .sort((a, b) => a.endTime - b.endTime)[0]; 

        if (!activeHold) {

            return;
        }

        const now = audioContext.currentTime - audioStartTime;
        activeHold.released = true;
        activeHold.holding = false;


        const releaseGrace = 0.15; 
        if (now < activeHold.endTime - releaseGrace || now > activeHold.endTime + releaseGrace) {
            console.log('missed');
            judgement = 'Miss'
            activeHold.hit = false;
        } else {
            console.log('success');
            if (now - activeHold.endTime > 0.10 || now - activeHold.endTime < -0.10){ judgement = 'Good'}
            else if (now - activeHold.endTime > 0.051 || now-activeHold.endTime < -0.051) { judgement = 'Great'}
            else {judgement = 'Perfect'};
            activeHold.hit = true;
            activeHold.hold_success = true;
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
      return;
    }
    const best = candidates[0];
    const absDt = Math.abs(best.dt);
    judgement = 'Miss';
    if (absDt <= windowPerfect) judgement = 'Perfect';
    else if (absDt <= windowGreat) judgement = 'Great';
    else if (absDt <= windowGood) judgement = 'Good';
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
    console.log('Judged', judgement, 'dt', Math.round(best.dt));
  }

    function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    
    for (let i = 0; i < lanes; i++) {
       
        ctx.fillStyle = '#222';
        ctx.fillRect(i * laneWidth, 0, laneWidth, canvas.height);

        
        if (laneActive[i]) {
            ctx.fillStyle = 'rgba(0, 200, 255, 0.3)'; 
            ctx.fillRect(i * laneWidth, 0, laneWidth, canvas.height);
        }

        ctx.strokeStyle = '#333';
        ctx.strokeRect(i * laneWidth, 0, laneWidth, canvas.height);
    }
    // draw hit line
    ctx.fillStyle = '#444';
    ctx.fillRect(0, hitY, canvas.width, 6);
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
      switch (judgement) {
        case 'Perfect' : ctx.fillStyle = 'rgba(11, 157, 224, 1)'; break;
        case 'Great' : ctx.fillStyle = 'rgba(23, 181, 70, 1)'; break;
        case 'Good' : ctx.fillStyle = 'rgba(194, 176, 38, 1)'; break;
        case 'Miss' : ctx.fillStyle = 'rgba(224, 11, 11, 1)'; break;
      }
      ctx.font = '32px sans-serif';
      ctx.fillText(judgement, canvas.width / 2 - 50, 100);
      const now = audioContext.currentTime;
      const songTime = now - audioStartTime; 
      // --- Miss detection ---
        for (const note of notes) {
        if (note.judged) continue;

        const dt = (songTime - note.time) * 1000;

        if (dt > windowGood) {
            note.judged = true;
            note.hit = false;
            judgement = 'Miss';
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
            ctx.fillStyle = note.judged ? (note.hit ? 'rgba(0, 255, 0, 0)' : '#900') : '#0aa';
            ctx.arc(x, yStart, Math.min(24, 16 + (1 - Math.min(1, dt/lookahead))*12), 0, Math.PI*2);
            ctx.fill();
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
            ctx.strokeStyle = note.holding ? 'rgba(0, 255, 0, 0.5)' : (!note.released ? '#0aa' : 'rgba(0,0,0,0)');
            ctx.lineWidth = 14;
            ctx.moveTo(x, tailStartY);
            ctx.lineTo(x, yEnd);
            ctx.stroke();

            if (!note.holding) {
                ctx.beginPath();
                ctx.fillStyle = note.judged ? (note.hit ? 'rgba(0, 255, 0, 0)' : '#900') : '#0aa';
                ctx.arc(x, yStart, 20, 0, Math.PI * 2);
                ctx.fill();
            }

            
            
            ctx.beginPath();
            ctx.arc(x, yEnd, 10, 0, Math.PI * 2);
            ctx.fillStyle = note.hold_success ? 'rgba(0, 102, 102, 0)' : 'rgba(0, 102, 102, 1)';
            ctx.fill();
            
    }
    }
    }
    requestAnimationFrame(draw);
  }

  draw();

})();