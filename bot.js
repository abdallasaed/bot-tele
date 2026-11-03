const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const https = require('https');

// 🔴 ضع التوكن الخاص ببوت التليجرام هنا
const TOKEN = '8958878441:AAFli_cBqcm4C1clt_k4bGd40pdKqfgrTMQ';

// 🔴 الأيدي المسموح لهم باستخدام البوت
const ALLOWED_IDS = [
    8423309136, // حسابك الأساسي
    1234567890  // 👈 استبدل هذا الرقم بحساب الشخص الثاني
];

const bot = new TelegramBot(TOKEN, { polling: true });
const DB_FILE = './active_streams.json';
const TOKENS_FILE = './saved_tokens.json';

const userSessions = {};

let activeStreams = {};
if (fs.existsSync(DB_FILE)) {
    let rawDb = fs.readFileSync(DB_FILE, 'utf-8');
    activeStreams = JSON.parse(rawDb ? rawDb : '{}');
}

let savedTokens = {};
if (fs.existsSync(TOKENS_FILE)) {
    let rawTok = fs.readFileSync(TOKENS_FILE, 'utf-8');
    savedTokens = JSON.parse(rawTok ? rawTok : '{}');
}

const saveActiveStreams = () => { try { fs.writeFileSync(DB_FILE, JSON.stringify(activeStreams, null, 2)); } catch (e) {} };
const saveTokens = () => { try { fs.writeFileSync(TOKENS_FILE, JSON.stringify(savedTokens, null, 2)); } catch (e) {} };
const isAuthorized = (chatId) => ALLOWED_IDS.includes(Number(chatId));

function registerToken(username, token) {
    for (const [label, data] of Object.entries(savedTokens)) {
        if (data.token === token) return label;
    }
    let index = 1;
    while (savedTokens[`${username} ${index}`]) index++;
    const label = `${username} ${index}`;
    savedTokens[label] = { token, username };
    saveTokens();
    return label;
}

function fetchJSON(url, options) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, json: () => JSON.parse(data ? data : '{}') }); }
                catch (e) { resolve({ status: res.statusCode, ok: false, json: () => ({}) }); }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

const getMainMenu = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: '▶️ بث مع تصميم (لوجو)', callback_data: 'start_stream_logo' }, { text: '▶️ بث خام (بدون لوجو)', callback_data: 'start_stream_nologo' }],
            [{ text: '📊 حالة السيرفرات', callback_data: 'status' }, { text: '⏱️ استهلاك الدقائق', callback_data: 'acc_info' }],
            [{ text: '🔑 إدارة التوكنات', callback_data: 'manage_tokens' }, { text: '🛑 إيقاف وتنظيف', callback_data: 'stop_menu' }]
        ]
    }
});

function promptForToken(chatId, prefix, title) {
    const labels = Object.keys(savedTokens);
    if (labels.length > 0) {
        const kb = labels.map(lbl => [{ text: `🐙 ${lbl}`, callback_data: `${prefix}:${lbl}` }]);
        kb.push([{ text: '➕ إضافة توكن جديد', callback_data: 'add_new_token' }]);
        bot.sendMessage(chatId, `${title}\n\n👇 **اختر حساباً، أو أرسل توكن جديد:**`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
    } else {
        bot.sendMessage(chatId, `${title}\n*(أرسل توكن GitHub ليتم حفظه وترقيمه)*:`, { parse_mode: 'Markdown' });
    }
}

bot.onText(/\/start/, (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    bot.sendMessage(msg.chat.id, '⚙️ **غرفة التحكم السحابية 🚀**\n✅ تم دعم روابط `.ts` و IPTV بالكامل مع الحفاظ على التزامن والرادار الاستباقي.', Object.assign({ parse_mode: 'Markdown' }, getMainMenu()));
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    if (!isAuthorized(chatId)) return bot.answerCallbackQuery(query.id, { text: '⛔ غير مصرح لك.', show_alert: true });
    bot.answerCallbackQuery(query.id).catch(() => {});

    if (data.startsWith('start_stream')) {
        userSessions[chatId] = { step: 'token', mode: data.includes('logo') ? 'logo' : 'no_logo' };
        promptForToken(chatId, 'select_start_token', '🐙 **اختر التوكن لبدء البث**');
    }
    else if (data === 'manage_tokens') {
        const kb = [[{ text: '➕ إضافة توكن', callback_data: 'add_new_token' }]];
        Object.keys(savedTokens).forEach(lbl => kb.push([{ text: `🗑 حذف: ${lbl}`, callback_data: `del_token:${lbl}` }]));
        bot.sendMessage(chatId, `🔑 **التوكنات المحفوظة:**`, { reply_markup: { inline_keyboard: kb } });
    }
    else if (data === 'add_new_token') {
        userSessions[chatId] = { step: 'save_only_token' };
        bot.sendMessage(chatId, '📝 **أرسل الـ Token الجديد الآن:**', { parse_mode: 'Markdown' });
    }
    else if (data.startsWith('del_token:')) {
        const lbl = data.substring(10);
        delete savedTokens[lbl]; saveTokens();
        bot.sendMessage(chatId, `✅ تم حذف الحساب **${lbl}**.`);
    }
    else if (data.startsWith('select_start_token:')) {
        const lbl = data.substring(19);
        const entry = savedTokens[lbl];
        if (!entry) return;
        userSessions[chatId] = { ...userSessions[chatId], githubToken: entry.token, username: entry.username, tokenLabel: lbl, step: 'input' };
        bot.sendMessage(chatId, `✅ تم الربط مع: \`${lbl}\`\n\n🔗 أرسل **رابط السحب (Input URL)**:`, { parse_mode: 'Markdown' });
    }
    else if (data === 'stop_menu') {
        const rn = Object.keys(activeStreams);
        const kb = rn.map(r => [{ text: `🛑 إيقاف: ${r}`, callback_data: `kill_one:${r}` }]);
        if (rn.length) kb.push([{ text: '💥 إيقاف جميع البثوث', callback_data: 'kill_all_active' }]);
        kb.push([{ text: '🧹 تنظيف حساب (من التوكنات)', callback_data: 'stop_by_token' }]);
        bot.sendMessage(chatId, '🛑 **خيارات الإيقاف:**', { reply_markup: { inline_keyboard: kb } });
    }
    else if (data === 'stop_by_token') {
        userSessions[chatId] = { step: 'stop_token' };
        promptForToken(chatId, 'select_stop_token', '🛑 **اختر الحساب للتنظيف**');
    }
    else if (data.startsWith('select_stop_token:')) {
        const entry = savedTokens[data.substring(18)];
        delete userSessions[chatId];
        if (!entry) return;
        bot.sendMessage(chatId, `⏳ جاري التنظيف... يرجى الانتظار 5 ثوانٍ.`);
        for (const r in activeStreams) if (activeStreams[r].session.githubToken === entry.token) delete activeStreams[r];
        saveActiveStreams();
        await stopAndCleanRepos(chatId, entry.token, entry.username, false);
    }
    else if (data === 'kill_all_active') {
        bot.sendMessage(chatId, '⏳ جاري إيقاف جميع البثوث بقوة... (يستغرق 5 ثوانٍ)');
        const repos = Object.keys(activeStreams);
        const tMap = {};
        await Promise.all(repos.map(async (r) => {
            tMap[activeStreams[r].session.githubToken] = activeStreams[r].session.username;
            await killSingleRepo(activeStreams[r].session.githubToken, activeStreams[r].session.username, r);
            delete activeStreams[r];
        }));
        saveActiveStreams();
        for (const [tk, usr] of Object.entries(tMap)) await stopAndCleanRepos(chatId, tk, usr, true);
        bot.sendMessage(chatId, '✅ **تم قتل جميع المكائن وتنظيفها بنجاح.**', getMainMenu());
    }
    else if (data.startsWith('kill_one:')) {
        const r = data.substring(9);
        const item = activeStreams[r];
        if (!item) return;
        delete activeStreams[r]; saveActiveStreams();
        bot.sendMessage(chatId, `⏳ جاري قتل البث \`${r}\`... (يستغرق 4 ثوانٍ)`);
        await killSingleRepo(item.session.githubToken, item.session.username, r);
        bot.sendMessage(chatId, `✅ **تم إيقاف البث نهائياً.**`, getMainMenu());
    }
    else if (data === 'status') {
        const count = Object.keys(activeStreams).length;
        bot.sendMessage(chatId, `📊 **حالة السيرفر:**\n🟢 البثوث النشطة حالياً: **${count}** مكائن.`, { parse_mode: 'Markdown' });
    }
    else if (data === 'acc_info') {
        userSessions[chatId] = { step: 'check_minutes' };
        promptForToken(chatId, 'select_minutes_token', '⏱️ **اختر الحساب لمعرفة استهلاك الدقائق:**');
    }
    else if (data.startsWith('select_minutes_token:')) {
        const entry = savedTokens[data.substring(21)];
        delete userSessions[chatId];
        if (!entry) return;
        bot.sendMessage(chatId, `🔄 جاري جلب الدقائق لـ \`${entry.username}\`...`, { parse_mode: 'Markdown' });
        const res = await fetchJSON(`https://api.github.com/users/${entry.username}/settings/billing/usage`, {
            method: 'GET', headers: { 'Authorization': `token ${entry.token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'NodeBot' }
        });
        if (res.ok) {
            const data = await res.json();
            bot.sendMessage(chatId, `👤 الحساب: \`${entry.username}\`\n⏱️ الاستهلاك المقدر: ${data.days_left_in_billing_cycle ? data.days_left_in_billing_cycle : 'غير محدد'}\n*(المكائن العامة لا تستهلك دقائق)*`, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, `⚠️ لا يمكن الوصول لبيانات الاستهلاك، ولكن البوت يستخدم مستودعات عامة بدقائق مفتوحة.`, { parse_mode: 'Markdown' });
        }
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id, text = msg.text;
    if (!isAuthorized(chatId)) return;
    if (!text) return;
    if (text === '/start') return;
    
    const session = userSessions[chatId];
    if (!session) return;

    if (session.step === 'save_only_token') {
        const tk = text.trim();
        const un = await checkGithubToken(tk);
        if (!un) return bot.sendMessage(chatId, '❌ توكن غير صالح.');
        delete userSessions[chatId];
        bot.sendMessage(chatId, `✅ **تم الحفظ!** باسم: \`${registerToken(un, tk)}\``, getMainMenu());
    }
    else if (session.step === 'token') {
        const tk = text.trim();
        const un = await checkGithubToken(tk);
        if (un) {
            const lbl = registerToken(un, tk);
            userSessions[chatId] = { ...session, githubToken: tk, username: un, tokenLabel: lbl, step: 'input' };
            bot.sendMessage(chatId, `✅ تم الحفظ: \`${lbl}\`\n\n🔗 أرسل **رابط السحب (Input URL)**:`, { parse_mode: 'Markdown' });
        } else bot.sendMessage(chatId, '❌ التوكن غير صحيح.');
    }
    else if (session.step === 'input') {
        if (!text.toLowerCase().startsWith('http')) return bot.sendMessage(chatId, '❌ الرابط يجب أن يبدأ بـ http.');
        session.inputUrl = text.trim();
        session.step = session.mode === 'logo' ? 'logo' : 'output';
        bot.sendMessage(chatId, session.step === 'logo' ? '🖼 أرسل **رابط اللوجو** (مفرغ بحجم 1920x1080):' : '🔑 أرسل **رابط المخرج** (RTMP):');
    }
    else if (session.step === 'logo') {
        session.logoUrl = text.trim();
        session.step = 'output';
        bot.sendMessage(chatId, '🔑 أرسل **رابط المخرج** (RTMP):');
    }
    else if (session.step === 'output') {
        let out = text.trim();
        if (out.includes(' ')) {
            const pts = out.split(/\s+/);
            out = `${pts[0].replace(/\/+$/, '')}/${pts.slice(1).join('').replace(/^\/+/, '')}`;
        }
        session.outputUrl = out;
        const copy = { ...session };
        delete userSessions[chatId];
        bot.sendMessage(chatId, '⏳ **جاري التجهيز وإطلاق البث المتزامن...**');
        await deployGithubStream(chatId, copy);
    }
});

async function checkGithubToken(token) {
    const res = await fetchJSON('https://api.github.com/user', {
        method: 'GET', headers: { 'Authorization': `token ${token}`, 'User-Agent': 'NodeBot' }
    });
    return res.ok ? (await res.json()).login : null;
}

async function deployGithubStream(chatId, session, options = { isRelay: false, isPreemptive: false, oldRepoName: null }) {
    const { githubToken, username, inputUrl, logoUrl, outputUrl, mode } = session;
    const repoName = `stream-worker-${Math.floor(Date.now() / 1000)}-${Math.floor(100 + Math.random() * 900)}`;
    const headers = { 'Authorization': `token ${githubToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'NodeBot' };

    try {
        const createRes = await fetchJSON('https://api.github.com/user/repos', {
            method: 'POST', headers, body: JSON.stringify({ name: repoName, private: false, auto_init: true })
        });
        
        if (!createRes.ok) {
            const errData = await createRes.json();
            throw new Error(`رفض جيت هاب إنشاء المستودع!\nالسبب القادم من خوادمهم:\n\`${errData.message || 'غير معروف'}\``);
        }
        
        await new Promise(r => setTimeout(r, 1500));

        const b64Token = Buffer.from(TOKEN).toString('base64');
        const b64GhToken = Buffer.from(githubToken).toString('base64');
        const b64Input = Buffer.from(inputUrl).toString('base64');
        const b64Logo = Buffer.from(logoUrl ? logoUrl : '').toString('base64');
        const b64Output = Buffer.from(outputUrl).toString('base64');

        const IS_PREEMPTIVE = options.isPreemptive ? '1' : '0';

        // تمت إعادة أوامر دعم صيغ .ts و IPTV (مثل user_agent و icy 0 و rw_timeout و genpts و thread_queue_size) 
        // لتخطي تقطيع الرابط بدون إفساد التزامن.
        const bashScript = [
            `#!/bin/bash`,
            `set +e`,
            `MAIN_PID=$$`,
            `BOT_TOKEN=$(echo "${b64Token}" | base64 -d)`,
            `GH_TOKEN=$(echo "${b64GhToken}" | base64 -d)`,
            `GH_USER="${username}"`,
            `CHAT_ID="${chatId}"`,
            `REPO_NAME="${repoName}"`,
            `MODE="${mode}"`,
            `RAW_INPUT=$(echo "${b64Input}" | base64 -d)`,
            `LOGO_URL=$(echo "${b64Logo}" | base64 -d)`,
            `OUTPUT_URL=$(echo "${b64Output}" | base64 -d)`,
            `IS_PREEMP="${IS_PREEMPTIVE}"`,
            `FF_PID=""`,
            `send_tg() { curl -s -X POST "https://api.telegram.org/bot\${BOT_TOKEN}/sendMessage" -d chat_id=\${CHAT_ID} -d text="$1" >/dev/null 2>&1; }`,
            `trap 'touch /tmp/stop; if [ -n "$FF_PID" ]; then kill -9 "$FF_PID" 2>/dev/null; fi; sudo pkill -9 -f ffmpeg 2>/dev/null; exit 0' SIGINT SIGTERM EXIT`,
            `( while true; do sleep 3; STOP_CHK=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token \${GH_TOKEN}" "https://api.github.com/repos/\${GH_USER}/\${REPO_NAME}/contents/STOP"); if [ "$STOP_CHK" = "200" ]; then touch /tmp/stop; sudo pkill -9 -f ffmpeg 2>/dev/null; kill -9 $MAIN_PID 2>/dev/null; exit 0; fi; done ) &`,
            `if ! command -v ffmpeg &> /dev/null; then sudo apt-get update -qq && sudo apt-get install -yqq ffmpeg >/dev/null 2>&1; fi`,
            
            `if [ "\$IS_PREEMP" = "1" ]; then`,
            `  send_tg "⚡ **استعداد النقل:** المكينة البديلة (\${REPO_NAME}) جاهزة وتنتظر إغلاق القديمة للتدخل فوراً..."`,
            `  sleep 15`,
            `else`,
            `  send_tg "⚙️ المكينة (\${REPO_NAME}) تبدأ الآن..."`,
            `fi`,

            `if [ "\$MODE" = "logo" ]; then`,
            `  curl -sL -k -o logo.png "\$LOGO_URL" >/dev/null 2>&1`,
            `  if ! file logo.png | grep -qE 'image|bitmap'; then`,
            `    echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==" | base64 -d > logo.png`,
            `  fi`,
            `fi`,
            `if [[ "\$RAW_INPUT" == *"youtube.com"* ]] || [[ "\$RAW_INPUT" == *"youtu.be"* ]]; then sudo apt-get install -yqq python3-pip >/dev/null 2>&1; pip install --break-system-packages -q yt-dlp >/dev/null 2>&1; fi`,
            `REPORTED=0`,
            `while true; do`,
            `  if [ -f /tmp/stop ]; then exit 0; fi`,
            `  IN_URL="\$RAW_INPUT"`,
            `  if [[ "\$RAW_INPUT" == *"youtube.com"* ]] || [[ "\$RAW_INPUT" == *"youtu.be"* ]]; then`,
            `    YT_URL=$(yt-dlp -g --no-warnings "\$RAW_INPUT" | head -n 1)`,
            `    if [ -n "\$YT_URL" ]; then IN_URL="\$YT_URL"; fi`,
            `  fi`,
            `  > stream.log`,
            `  if [ "\$MODE" = "logo" ]; then`,
            `    ffmpeg -hide_banner -user_agent "VLC/3.0.20 LibVLC/3.0.20" -icy 0 -fflags +genpts -err_detect ignore_err -rw_timeout 15000000 -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 -thread_queue_size 4096 -i "\$IN_URL" -thread_queue_size 4096 -i "logo.png" -filter_complex "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[base];[1:v]scale=1920:1080[logo];[base][logo]overlay=0:0" -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -profile:v main -level 4.1 -b:v 5000k -maxrate 5500k -bufsize 10000k -r 30 -g 60 -c:a aac -b:a 128k -ar 44100 -max_muxing_queue_size 9999 -f flv "\$OUTPUT_URL" > stream.log 2>&1 &`,
            `  else`,
            `    ffmpeg -hide_banner -user_agent "VLC/3.0.20 LibVLC/3.0.20" -icy 0 -fflags +genpts -err_detect ignore_err -rw_timeout 15000000 -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 -thread_queue_size 4096 -i "\$IN_URL" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1" -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -profile:v main -level 4.1 -b:v 5000k -maxrate 5500k -bufsize 10000k -r 30 -g 60 -c:a aac -b:a 128k -ar 44100 -max_muxing_queue_size 9999 -f flv "\$OUTPUT_URL" > stream.log 2>&1 &`,
            `  fi`,
            `  FF_PID=$!`,
            `  sleep 4`,
            `  if kill -0 "$FF_PID" 2>/dev/null; then`,
            `    if [ $REPORTED -eq 0 ] && [ "\$IS_PREEMP" = "0" ]; then send_tg "✅ **نجاح! البث مستقر.**\nالمكينة: \${REPO_NAME}"; REPORTED=1; fi`,
            `    wait "$FF_PID" 2>/dev/null`,
            `  else`,
            `    if [ $REPORTED -eq 0 ] && [ "\$IS_PREEMP" = "0" ]; then ERR=$(tail -n 6 stream.log | tr '\\n' ' ' | cut -c 1-200); send_tg "❌ **فشل البث:**\n\${ERR}"; REPORTED=1; fi`,
            `  fi`,
            `  sleep 2`,
            `done`
        ].join('\n');

        const b64Script = Buffer.from(bashScript).toString('base64');
        const workflowYaml = `name: Stream\non: [push]\njobs:\n  stream:\n    runs-on: ubuntu-latest\n    steps:\n    - run: echo "${b64Script}" | base64 -d > run.sh && chmod +x run.sh && ./run.sh\n`;

        const putRes = await fetchJSON(`https://api.github.com/repos/${username}/${repoName}/contents/.github/workflows/stream.yml`, {
            method: 'PUT', headers, body: JSON.stringify({ message: "Init", content: Buffer.from(workflowYaml).toString('base64') })
        });

        if (putRes.ok) {
            activeStreams[repoName] = { chatId, session, repoName, createdAt: Date.now(), renewing: false };
            saveActiveStreams();
            
            if (options.isPreemptive && options.oldRepoName) {
                setTimeout(async () => {
                    if (!activeStreams[repoName]) return; 
                    await killSingleRepo(session.githubToken, session.username, options.oldRepoName);
                    if (activeStreams[options.oldRepoName]) {
                        delete activeStreams[options.oldRepoName];
                        saveActiveStreams();
                    }
                    bot.sendMessage(chatId, `✅ **اكتمل النقل السلس بنجاح ⚡**\nتم التبديل إلى المكينة \`${repoName}\` بدون أن ينقطع البث عن المشاهدين.`, { parse_mode: 'Markdown' });
                }, 45000); 
            } 
            else if (options.isRelay) {
                bot.sendMessage(chatId, `🔥 **تم إطلاق المكينة البديلة!**\nاسم المستودع: \`${repoName}\``, { parse_mode: 'Markdown' });
            } 
            else {
                bot.sendMessage(chatId, `🔥 **تم رفع ملفات المكينة بنجاح!**\nاسم المستودع: \`${repoName}\``, { parse_mode: 'Markdown' });
            }

        } else {
            const errData = await putRes.json();
            throw new Error(`فشل رفع ملف التشغيل. السبب:\n\`${errData.message || 'غير معروف'}\``);
        }
    } catch (err) {
        bot.sendMessage(chatId, `❌ **خطأ:** ${err.message}`, { parse_mode: 'Markdown' });
    }
}

async function killSingleRepo(token, username, repoName) {
    const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'NodeBot' };
    try {
        const res = await fetchJSON(`https://api.github.com/repos/${username}/${repoName}/actions/runs`, { method: 'GET', headers });
        if (res.ok) {
            const data = await res.json();
            const runs = data.workflow_runs ? data.workflow_runs : [];
            for (const run of runs) {
                if (run.status !== 'completed') {
                    await fetchJSON(`https://api.github.com/repos/${username}/${repoName}/actions/runs/${run.id}/cancel`, { method: 'POST', headers });
                    await fetchJSON(`https://api.github.com/repos/${username}/${repoName}/actions/runs/${run.id}/force-cancel`, { method: 'POST', headers });
                }
            }
        }
        await new Promise(r => setTimeout(r, 3000));
        await fetchJSON(`https://api.github.com/repos/${username}/${repoName}`, { method: 'DELETE', headers });
        return true;
    } catch (e) { return false; }
}

async function stopAndCleanRepos(chatId, token, username, silent = false) {
    const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'NodeBot' };
    try {
        const res = await fetchJSON(`https://api.github.com/user/repos?affiliation=owner&per_page=100`, { method: 'GET', headers });
        let stoppedCount = 0;
        if (res.ok) {
            const repos = await res.json();
            const workers = repos.filter(r => r.name && r.name.startsWith('stream-worker-'));
            await Promise.all(workers.map(async (repo) => {
                delete activeStreams[repo.name];
                if (await killSingleRepo(token, username, repo.name)) stoppedCount++;
            }));
            saveActiveStreams();
        }
        if (!silent) bot.sendMessage(chatId, stoppedCount > 0 ? `✅ **تم تنظيف ${stoppedCount} مكينة.**` : '✅ الحساب نظيف.', getMainMenu());
    } catch (err) {
        if (!silent) bot.sendMessage(chatId, `❌ **خطأ:** ${err.message}`);
    }
}

setInterval(async () => {
    for (const repoName in activeStreams) {
        const streamData = activeStreams[repoName];
        if (!streamData) continue;
        const { chatId, session, createdAt, renewing } = streamData;
        const headers = { 'Authorization': `token ${session.githubToken}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'NodeBot' };
        
        const upTimeMinutes = (Date.now() - createdAt) / 60000;
        if (upTimeMinutes >= 350 && !renewing) {
            activeStreams[repoName].renewing = true;
            saveActiveStreams();
            bot.sendMessage(chatId, `♻️ **نظام التسليم والتسلم ⚡:**\nالمكينة \`${repoName}\` وصلت لـ 5 ساعات و50 دقيقة.\nجاري تجهيز وتشغيل مكينة بديلة في الخلفية وسيتم نقل البث لها بثوانٍ لتجنب الانقطاع...`, { parse_mode: 'Markdown' });
            await deployGithubStream(chatId, session, { isPreemptive: true, oldRepoName: repoName });
            continue; 
        }

        try {
            const res = await fetchJSON(`https://api.github.com/repos/${session.username}/${repoName}/actions/runs`, { method: 'GET', headers });
            if (res.ok) {
                const data = await res.json();
                const runs = data.workflow_runs ? data.workflow_runs : [];
                if (runs.length > 0) {
                    const status = runs[0].status;
                    if (status === 'completed' || status === 'cancelled' || status === 'failure' || status === 'timed_out') {
                        if (!renewing) {
                            delete activeStreams[repoName];
                            saveActiveStreams();
                            await killSingleRepo(session.githubToken, session.username, repoName);
                            bot.sendMessage(chatId, `♻️ **الرادار:** توقفت المكينة \`${repoName}\` فجأة، جاري إعادة الإطلاق الفوري.`);
                            await deployGithubStream(chatId, session, { isRelay: true });
                        }
                    }
                }
            }
        } catch (e) {}
    }
}, 180000);

console.log("🤖 البوت السحابي (رادار استباقي ⚡ + دعم روابط TS) جاهز ويعمل الآن...");
