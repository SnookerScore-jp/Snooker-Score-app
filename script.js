/**
 * グローバル状態管理変数
 */
let scores = [0, 0];           // 現在のフレームの点数 [P1, P2]
let frames = [0, 0];           // 獲得したフレーム数 [P1, P2]
let foulGiven = [0, 0];        // 与えたファウル得点 [P1, P2]
let playerNames = ["Player 1", "Player 2"];
let activePlayer = 0;          // 現在ターンのプレイヤー (0 or 1)
let currentBreak = 0;          // 現在の連続得点合計
let breakHistory = [];         // 現在のブレイクで入れたボールの配列
let history = [];              // Undo(やり直し)用の過去状態保存スタック
let summaryLog = [];           // フレーム終了ごとの記録
let actionLog = [];            // 全アクションの履歴
let startTime = null;          // タイマー開始時間
let timerInterval = null;      // タイマー更新用インターバル
let pendingSlot = 0;           // 名前変更対象のプレイヤースロット
let cachedNames = [];          // CSVから読み込んだ名前リスト
let pendingWinnerIdx = -1;     // 勝利確定待ちのプレイヤー
let milestonesReached = { 50: false, 100: false, 147: false }; // お祝いフラグ
const ballNames = ["", "RED", "YELLOW", "GREEN", "BROWN", "BLUE", "PINK", "BLACK"];
let wakeLock = null;           // 画面スリープ防止用

/**
 * 画面スリープ防止をリクエスト
 */
const requestWakeLock = async () => { 
    try { 
        if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); 
    } catch (err) {} 
};

/**
 * 画面の数値を最新の状態に更新する
 */
function updateDisplay() {
    document.getElementById('p1-score').innerText = scores[0]; 
    document.getElementById('p2-score').innerText = scores[1];
    document.getElementById('p1-frames').innerText = frames[0]; 
    document.getElementById('p2-frames').innerText = frames[1];
    document.getElementById('p1-name').innerText = playerNames[0]; 
    document.getElementById('p2-name').innerText = playerNames[1];
    document.getElementById('p1-foul-given').innerText = foulGiven[0]; 
    document.getElementById('p2-foul-given').innerText = foulGiven[1];
    
    // 現在のプレイヤー側を光らせる
    document.getElementById('p1-area').classList.toggle('active', activePlayer === 0);
    document.getElementById('p2-area').classList.toggle('active', activePlayer === 1);
    
    // 点差とブレイク情報の表示
    document.getElementById('score-diff').innerText = Math.abs(scores[0] - scores[1]);
    document.getElementById('break-area').innerText = currentBreak > 0 ? "BREAK: " + currentBreak : "";
    
    // ブレイク中のボールアイコンを表示
    const ballsDiv = document.getElementById('break-balls'); 
    ballsDiv.innerHTML = "";
    breakHistory.forEach(val => { 
        const b = document.createElement('div'); 
        b.className = `ball-sphere ball-small color-${val}`; 
        ballsDiv.appendChild(b); 
    });
}

/**
 * 操作履歴をログに保存
 */
function logEvent(type, detail) {
    const time = document.getElementById('timer').innerText;
    actionLog.push({ 
        frame: frames[0] + frames[1] + 1, 
        time, 
        player: playerNames[activePlayer], 
        type, detail, 
        p1Score: scores[0], 
        p2Score: scores[1] 
    });
}

/**
 * タイマーのカウントアップを開始
 */
function startTimer() { 
    if (timerInterval) return; 
    startTime = Date.now(); 
    timerInterval = setInterval(() => { 
        const diff = Math.floor((Date.now() - startTime) / 1000); 
        document.getElementById('timer').innerText = 
            `${Math.floor(diff/60).toString().padStart(2,'0')}:${(diff%60).toString().padStart(2,'0')}`; 
    }, 1000); 
    requestWakeLock();
}

/**
 * 点数を加算するメイン処理
 */
function addScore(p, el) { 
    if(el) el.blur(); 
    saveState(); 
    startTimer(); 
    scores[activePlayer] += p; 
    currentBreak += p; 
    breakHistory.push(p); 
    logEvent("SCORE", `${ballNames[p]} (${p}pts)`);
    updateDisplay(); 

    // 特定の点数（50, 100, 147）に達した時の演出
    if (currentBreak >= 147 && !milestonesReached[147]) { 
        milestonesReached[147]=true; triggerLuxuryCelebration(); 
    } else if (currentBreak >= 100 && !milestonesReached[100]) { 
        milestonesReached[100]=true; triggerCelebration("CENTURY", "高"); 
    } else if (currentBreak >= 50 && !milestonesReached[50]) { 
        milestonesReached[50]=true; triggerCelebration("HALF CENTURY", "低"); 
    }
}

/**
 * ファウル処理：相手に点数を与え、ブレイクをリセット
 */
function foul(p, el) { 
    if(el) el.blur(); 
    saveState(); 
    startTimer(); 
    foulGiven[activePlayer] += p; 
    scores[activePlayer === 0 ? 1 : 0] += p; 
    logEvent("FOUL", `Foul ${p} to opponent`); 
    resetTurn(); 
}

/**
 * ターン交替
 */
function handleSwitch(el) { 
    if(el) el.blur(); 
    saveState(); 
    startTimer(); 
    logEvent("SWITCH", "Turn Switched"); 
    activePlayer = activePlayer === 0 ? 1 : 0; 
    resetTurn(); 
}

/**
 * Undo：一手戻る
 */
function handleUndo(el) { 
    if(el) el.blur(); 
    if (history.length) { 
        const last = JSON.parse(history.pop()); 
        scores = last.scores; frames = last.frames; foulGiven = last.foulGiven; 
        activePlayer = last.activePlayer; currentBreak = last.currentBreak; 
        breakHistory = last.breakHistory; milestonesReached = last.milestonesReached; 
        playerNames = last.playerNames; 
        updateDisplay(); 
        logEvent("UNDO_EXECUTED", `Reverted to previous state`);
    } 
}

/**
 * フレームを終了し勝者を記録する
 */
function finalizeFrame(idx, method = "NORMAL") { 
    summaryLog.push({ 
        frameNum: frames[0] + frames[1] + 1, 
        p1Name: playerNames[0], p1Final: scores[0], 
        p2Name: playerNames[1], p2Final: scores[1], 
        winner: playerNames[idx], method 
    });
    logEvent("FRAME_END", `Winner: ${playerNames[idx]} (${method})`);
    frames[idx]++; 
    scores = [0, 0]; 
    foulGiven = [0, 0]; 
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } 
    document.getElementById('timer').innerText = "00:00"; 
    resetTurn(); 
    closeModal('black-ball-modal'); 
}

/**
 * CSVログの書き出し：ファイル名を「Log_年月日_時分」にして保存
 */
function exportDetailedLog(el) { 
    if(el) el.blur(); 
    if (!actionLog.length && !summaryLog.length) return;

    // 1. CSVデータの作成
    let csv = "\uFEFF【MATCH SUMMARY】\nFrame,Winner,P1,Score,P2,Score,Method\n";
    summaryLog.forEach(s => csv += `${s.frameNum},"${s.winner}","${s.p1Name}",${s.p1Final},"${s.p2Name}",${s.p2Final},${s.method}\n`);
    csv += "\n【DETAILED ACTION LOG】\nTime,Frame,Player,Action,Detail,P1,P2\n"; 
    actionLog.forEach(l => csv += `${l.time},${l.frame},"${l.player}",${l.type},"${l.detail}",${l.p1Score},${l.p2Score}\n`); 

    // 2. 現在の日時を取得してフォーマット (例: 20260128_1525)
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');

    const timestamp = `${YYYY}${MM}${DD}_${hh}${mm}`;
    const fileName = `Log_${timestamp}.csv`;

    // 3. ダウンロード処理
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); 
    const link = document.createElement("a"); 
    link.href = URL.createObjectURL(blob); 
    
    // 生成した「Log_年月日_時分.csv」をセット
    link.download = fileName; 
    
    link.click(); 
    
    // メモリのクリーンアップ
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
}
/**
 * 補助関数群（モーダル制御・状態保存・リセット）
 */
function finalizeReset() { 
    scores=[0,0]; frames=[0,0]; foulGiven=[0,0]; playerNames=["Player 1","Player 2"]; 
    history=[]; activePlayer=0; 
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } 
    document.getElementById('timer').innerText = "00:00"; 
    resetTurn(); closeModal('reset-modal'); 
    logEvent("MATCH_RESET", "Board cleared"); 
}

function resetTurn() { 
    currentBreak = 0; breakHistory = []; 
    milestonesReached = { 50: false, 100: false, 147: false }; 
    updateDisplay(); 
}

function saveState() { 
    history.push(JSON.stringify({ 
        scores: [...scores], frames: [...frames], foulGiven: [...foulGiven], 
        activePlayer, currentBreak, breakHistory: [...breakHistory], 
        milestonesReached: {...milestonesReached}, playerNames: [...playerNames] 
    })); 
}

function showResetModal() { document.getElementById('reset-modal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function showConcedeModal(el) { 
    if(el) el.blur(); 
    if (scores[0] === scores[1]) { 
        document.getElementById('bb-p1-btn').innerText = playerNames[0]; 
        document.getElementById('bb-p2-btn').innerText = playerNames[1]; 
        document.getElementById('black-ball-modal').style.display = 'flex'; 
    } else { 
        pendingWinnerIdx = scores[0] > scores[1] ? 0 : 1; 
        document.getElementById('concede-text').innerText = `${playerNames[pendingWinnerIdx]} Wins?`; 
        document.getElementById('concede-modal').style.display = 'flex'; 
    } 
}

function finalizeConcede() { finalizeFrame(pendingWinnerIdx, "CONCEDED/NORMAL"); closeModal('concede-modal'); }

function openPlayerModal(slot) { 
    pendingSlot = slot; 
    document.getElementById('player-modal').style.display = 'flex'; 
    renderPlayerList(); 
}

function openManualInputModal() { 
    closeModal('player-modal'); 
    document.getElementById('manual-input-modal').style.display = 'flex'; 
    document.getElementById('manual-name-field').focus(); 
}

function submitManualName() { 
    const v = document.getElementById('manual-name-field').value.trim(); 
    if(v) playerNames[pendingSlot] = v; 
    updateDisplay(); 
    closeModal('manual-input-modal'); 
}

/**
 * プレイヤーリスト（CSV読み込み）の描画
 */
function renderPlayerList() { 
    const listDiv = document.getElementById('modal-player-list'); 
    listDiv.innerHTML = cachedNames.length ? "" : "<p style='color:#666; padding:2vh;'>No players loaded</p>"; 
    cachedNames.forEach(name => { 
        const div = document.createElement('div'); 
        div.style.padding = '2.5vh'; div.style.borderBottom = '1px solid #222'; div.style.cursor = 'pointer'; 
        div.innerText = name; 
        div.onclick = () => { playerNames[pendingSlot] = name; updateDisplay(); closeModal('player-modal'); }; 
        listDiv.appendChild(div); 
    }); 
}

// CSV読み込みイベント
document.getElementById('csv-file-input').addEventListener('change', (e) => { 
    const r = new FileReader(); 
    r.onload = (ev) => { 
        const rows = ev.target.result.split(/\r?\n/).filter(l => l.trim()); 
        cachedNames = rows.slice(1).map(line => line.split(',')[1]?.trim() || "Unknown"); 
        renderPlayerList(); 
    }; 
    r.readAsText(e.target.files[0]); 
});

/**
 * 演出アニメーション関数
 */
function triggerLuxuryCelebration() {
    const text = document.getElementById('celebration-text'); 
    text.innerText = "MAXIMUM BREAK ! 147";
    document.getElementById('celebration-overlay').style.background = "rgba(241, 196, 15, 0.3)"; 
    text.classList.add('show');
    const end = Date.now() + 5000;
    (function frame() {
        confetti({ particleCount: 10, angle: 60, spread: 80, origin: { x: 0, y: 0.7 }, colors: ['#f1c40f', '#fff'] });
        confetti({ particleCount: 10, angle: 120, spread: 80, origin: { x: 1, y: 0.7 }, colors: ['#f1c40f', '#fff'] });
        if (Date.now() < end) requestAnimationFrame(frame);
    }());
    setTimeout(() => { text.classList.remove('show'); document.getElementById('celebration-overlay').style.background = "rgba(0,0,0,0)"; }, 6000);
}

function triggerCelebration(msg, level) {
    const text = document.getElementById('celebration-text'); 
    text.innerText = msg; text.classList.add('show');
    if (level === "低") { 
        confetti({ particleCount: 40, spread: 70, origin: { y: 0.6 } }); 
    } else { 
        const end = Date.now() + 2000; 
        (function frame() { 
            confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#f1c40f', '#fff'] }); 
            confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#f1c40f', '#fff'] }); 
            if (Date.now() < end) requestAnimationFrame(frame); 
        }()); 
    }
    setTimeout(() => { text.classList.remove('show'); }, 3000);
}

/**
 * キーボードショートカット
 */
window.onkeydown = (e) => { 
    const key = e.key.toLowerCase(); 
    if (key === 'j') { 
        if (document.getElementById('secret-modal').style.display !== 'flex') 
            document.getElementById('secret-modal').style.display = 'flex'; 
        return; 
    }
    if (key >= '1' && key <= '7') addScore(parseInt(key)); 
    if (key === 'enter') handleSwitch(); 
    if (key === 'backspace') handleUndo(); 
    if (key === '.') showConcedeModal(); 
    if (key === '/') foul(4); 
    if (key === '*') foul(5); 
    if (key === '-') foul(6); 
    if (key === '+') foul(7); 
};

// 最初のタップでフルスクリーン化
function handleFirstClick() { 
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{}); 
    requestWakeLock(); 
}

// 初期表示実行
updateDisplay();