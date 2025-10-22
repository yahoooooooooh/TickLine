// js/constants.js
import { startOfDay } from './utils.js';

export const FILES = { 
  daily:'daily.json', 
  weekly:'weekly.json', 
  monthly:'monthly.json', 
  yearly:'yearly.json', 
  meta:'meta.json', 
  redemption:'redemption.json',
  apHistory:'action_power_history.json' 
};

export const defaultMeta = {
  points: 0,
  sunkenSilver: 1,
  // --- START: 新增的代码 ---
  sleepState: {
    isAsleep: false,
    sleepUntil: null,     // ISO string
    sleepStartedAt: null, // ISO string
    pendingPenalty: 0,    // 新增：用于记录待扣除的AP罚款
    isEligibleForReward: false // 新增：标记是否在22点准时入睡
  },
  // --- END: 新增的代码 ---
  actionPower: {
    base: 10,              // 基础数值 
    perPoint: 0.1,         // 每积分提升系数 x 
    dailyRefreshHour: 6,   // 每日刷新时刻 
    decayStartHour: 6,     // 每小时衰减起点 
    decayEndHour: 22,      // 每小时衰减终点 
    defaultStageCost: 1,   // 阶段推进默认消耗 
    currentAP: 0,          // 当日当前行动力 
    dailyCap: 0,           // 当日上限（由公式得出） 
    lastRefreshedDay: null,// YYYY-MM-DD 
    lastDecayHourMark: null
  },
  checklist: {
    items: [] // { id, title, content, lastCompletedAt }
  },
  shop: {
    lastRefresh: null,
    items: [],
    purchasedSlots: []
  },
  purchasedLimitedItems: [], // 存储已购买的限定商品ID
  permanentUpgrades: [], // 存储所有永久升级
  lastChestClaimDate: null, 
  limits: { 
    dailyMaxPerDay: 2, 
    dailyMaxSimultaneous: 2, 
    weeklyMaxPerWeek: 1, 
    weeklyMaxSimultaneous: 1, 
    monthlyMaxPerMonth: 1, 
    monthlyMaxSimultaneous: 1, 
    yearlyUnlocked: false, 
    yearlyMaxPerYear: 1 
  },
  achievements: { 
    unlocked: {}, 
    stats: {
      totalTasksCompleted: 0,
      tasksCompletedByType: { daily: 0, weekly: 0, monthly: 0, yearly: 0 },
      totalTaskUpdates: 0,
      totalSilverSpent: 0,
    }
  },
  settings: { 
    msPerPx: 60 * 1000, 
    viewportStartISO: startOfDay(new Date()).toISOString() 
  }
};

export const REWARDS_MILESTONES = [
  { points: 1,   desc: "每日任务创建上限 +1",  apply: meta => meta.limits.dailyMaxPerDay += 1 },
  { points: 5,   desc: "每日任务创建上限 +1",  apply: meta => meta.limits.dailyMaxPerDay += 1 },
  { points: 10,  desc: "每周任务创建上限 +1",  apply: meta => meta.limits.weeklyMaxPerWeek += 1 },
  { points: 20,  desc: "每周任务创建上限 +1",  apply: meta => meta.limits.weeklyMaxPerWeek += 1 },
  { points: 30,  desc: "每月任务创建上限 +1",  apply: meta => meta.limits.monthlyMaxPerMonth += 1 },
  { points: 50,  desc: "每月任务创建上限 +1",  apply: meta => meta.limits.monthlyMaxPerMonth += 1 },
  { points: 100, desc: "解锁「年」类型任务",    apply: meta => meta.limits.yearlyUnlocked = true },
  { points: 150, desc: "全类型上限+1 (日/周/月)", apply: meta => { meta.limits.dailyMaxPerDay += 1; meta.limits.weeklyMaxPerWeek += 1; meta.limits.monthlyMaxPerMonth += 1; } },
  { points: 300, desc: "全类型上限+1 (日/周/月/年)", apply: meta => { meta.limits.dailyMaxPerDay += 1; meta.limits.weeklyMaxPerWeek += 1; meta.limits.monthlyMaxPerMonth += 1; if(!meta.limits.yearlyMaxPerYear) meta.limits.yearlyMaxPerYear = 1; meta.limits.yearlyMaxPerYear += 1; } },
];

const EXISTING_ACHIEVEMENTS = {
    taskMaster: {
      name: "功勋卓著",
      desc: "累计完成的任务总数。",
      hidden: false,
      checkOn: ['task_complete'],
      getProgress: (trigger, data, db) => {
        return ['daily', 'weekly', 'monthly', 'yearly'].reduce((acc, type) => 
            acc + db.list(type).filter(t => t.status === 'completed').length, 0);
      },
      tiers: [
        { goal: 1,   reward: { type: 'points', value: 1 }, desc: "完成首个任务" },
        { goal: 10,  reward: { type: 'points', value: 5 }, desc: "完成10个任务" },
        { goal: 50,  reward: { type: 'points', value: 10 }, desc: "完成50个任务" },
        { goal: 100, reward: { type: 'points', value: 15 }, desc: "完成100个任务" },
        { goal: 250, reward: { type: 'points', value: 25 }, desc: "完成250个任务" },
        { goal: 500, reward: { type: 'limit', key: 'dailyMaxSimultaneous', value: 1 }, desc: "完成500个任务，每日并行+1" },
        { goal: 1000, reward: { type: 'points', value: 100 }, desc: "完成1000个任务！千锤百炼！" },
      ],
    },
    dailyExpert: {
        name: "每日达人",
        desc: "专注于完成每日任务，日事日毕。",
        hidden: false,
        checkOn: ['task_complete'],
        getProgress: (trigger, data, db) => db.list('daily').filter(t => t.status === 'completed').length,
        tiers: [
            { goal: 10, reward: { type: 'points', value: 5 }, desc: "完成10个每日任务" },
            { goal: 50, reward: { type: 'limit', key: 'dailyMaxPerDay', value: 1 }, desc: "完成50个每日任务, 每日创建上限+1" },
            { goal: 100, reward: { type: 'silver', value: 5 }, desc: "完成100个每日任务, 获5水葬银货" },
        ]
    },
    weeklyDominator: {
        name: "周常主宰",
        desc: "以周为单位，稳步推进重要事务。",
        hidden: false,
        checkOn: ['task_complete'],
        getProgress: (trigger, data, db) => db.list('weekly').filter(t => t.status === 'completed').length,
        tiers: [
            { goal: 5, reward: { type: 'points', value: 10 }, desc: "完成5个每周任务" },
            { goal: 20, reward: { type: 'limit', key: 'weeklyMaxPerWeek', value: 1 }, desc: "完成20个每周任务, 每周创建上限+1" },
            { goal: 50, reward: { type: 'silver', value: 10 }, desc: "完成50个每周任务, 获10水葬银货" },
        ]
    },
    monthlyCommander: {
        name: "月度统帅",
        desc: "掌控月度节奏，完成长期目标。",
        hidden: false,
        checkOn: ['task_complete'],
        getProgress: (trigger, data, db) => db.list('monthly').filter(t => t.status === 'completed').length,
        tiers: [
            { goal: 3, reward: { type: 'points', value: 15 }, desc: "完成3个每月任务" },
            { goal: 12, reward: { type: 'limit', key: 'monthlyMaxPerMonth', value: 1 }, desc: "完成12个每月任务, 每月创建上限+1" },
            { goal: 24, reward: { type: 'silver', value: 15 }, desc: "完成24个每月任务, 获15水葬银货" },
        ]
    },
    homeRun: {
        name: "全垒打",
        desc: "在一天内完成所有已安排的每日任务。",
        hidden: false,
        checkOn: ['task_complete'],
        getProgress: (trigger, data, db) => {
            if (data.task.type !== 'daily') return 0;
            const dayOfTask = startOfDay(new Date(data.task.start));
            const tasksForThatDay = db.list('daily').filter(t => startOfDay(new Date(t.start)).getTime() === dayOfTask.getTime());
            const allCompleted = tasksForThatDay.every(t => t.status === 'completed');
            return allCompleted ? 1 : 0;
        },
        tiers: [
            { goal: 1, reward: { type: 'points', value: 5 }, desc: "首次达成单日全完成" },
        ]
    },
    schedulePlanner: {
        name: "日程规划师",
        desc: "在时间轴上积极地规划未来。",
        hidden: false,
        checkOn: ['task_create'],
        getProgress: (trigger, data, db) => {
            const now = Date.now();
            const futureTasks = ['daily', 'weekly', 'monthly', 'yearly']
                .flatMap(type => db.list(type))
                .filter(t => new Date(t.start) > now);
            return futureTasks.length;
        },
        tiers: [
            { goal: 5, reward: { type: 'points', value: 2 }, desc: "规划了5个未来任务" },
            { goal: 15, reward: { type: 'points', value: 5 }, desc: "规划了15个未来任务" },
            { goal: 30, reward: { type: 'points', value: 10 }, desc: "规划了30个未来任务" },
        ]
    },
    constantImprovement: {
        name: "精益求精",
        desc: "不断调整和优化你的任务。",
        hidden: true,
        checkOn: ['task_update'],
        getProgress: (trigger, data, db) => db.meta.achievements.stats.totalTaskUpdates,
        tiers: [
            { goal: 5, reward: { type: 'points', value: 2 }, desc: "编辑任务5次" },
            { goal: 25, reward: { type: 'points', value: 5 }, desc: "编辑任务25次" },
            { goal: 100, reward: { type: 'silver', value: 3 }, desc: "编辑任务100次, 获3水葬银货" },
        ]
    },
    shopaholic: {
        name: "购物达人",
        desc: "在水葬银货商店中消费。",
        hidden: false,
        checkOn: ['shop_purchase'],
        getProgress: (trigger, data, db) => db.meta.achievements.stats.totalSilverSpent,
        tiers: [
            { goal: 1, reward: { type: 'points', value: 1 }, desc: "首次购物" },
            { goal: 10, reward: { type: 'points', value: 5 }, desc: "累计消费10水葬银货" },
            { goal: 50, reward: { type: 'points', value: 10 }, desc: "累计消费50水葬银货" },
        ]
    },
    pointCollector: {
        name: "积分收藏家",
        desc: "累计获得的积分总数。",
        hidden: false,
        checkOn: ['task_complete', 'redeem_code'],
        getProgress: (trigger, data, db) => db.meta.points,
        tiers: [
            { goal: 10,   reward: { type: 'silver', value: 1 }, desc: "累积10积分，获1水葬银货" },
            { goal: 50,   reward: { type: 'silver', value: 3 }, desc: "累积50积分，获3水葬银货" },
            { goal: 100,  reward: { type: 'limit', key: 'weeklyMaxSimultaneous', value: 1 }, desc: "累积100积分，每周并行+1" },
            { goal: 200,  reward: { type: 'silver', value: 10 }, desc: "累积200积分，获10水葬银货" },
            { goal: 500,  reward: { type: 'limit', key: 'monthlyMaxSimultaneous', value: 1 }, desc: "累积500积分，每月并行+1" },
        ],
    },
    masterStrategist: {
      name: "深谋远虑",
      desc: "创建一个开始时间在未来的任务。",
      hidden: false,
      checkOn: ['task_create', 'task_update'],
      getProgress: (trigger, data, db) => {
         const task = data.task;
         const diffDays = (new Date(task.start).getTime() - Date.now()) / (1000 * 3600 * 24);
         return diffDays;
      },
      tiers: [
          { goal: 7, reward: { type: 'points', value: 2 }, desc: "规划7日之外的任务" },
          { goal: 30, reward: { type: 'points', value: 5 }, desc: "规划30日之外的任务" },
          { goal: 90, reward: { type: 'points', value: 10 }, desc: "规划90日之外的任务" },
      ],
    },
    swiftAndDecisive: {
      name: "雷厉风行",
      desc: "提前完成一个“每周”或更长周期的任务。",
      hidden: false,
      checkOn: ['task_complete'],
      getProgress: (trigger, data, db) => {
        const task = data.task;
        if (!['weekly', 'monthly', 'yearly'].includes(task.type)) return 0;
        const hoursAhead = (new Date(task.end).getTime() - Date.now()) / (1000 * 3600);
        return hoursAhead > 0 ? hoursAhead : 0;
      },
      tiers: [
        { goal: 24, reward: { type: 'points', value: 3 }, desc: "提前24小时完成" },
        { goal: 48, reward: { type: 'points', value: 5 }, desc: "提前48小时完成" },
        { goal: 168, reward: { type: 'points', value: 10 }, desc: "提前整整一周(168小时)完成" },
      ],
    },
    nightOwl: {
      name: "夜猫子",
      desc: "在深夜完成任务。",
      hidden: true,
      checkOn: ['task_complete'],
      getProgress: (trigger, data, db) => {
        const now = new Date();
        const hour = now.getHours();
        return (hour >= 0 && hour < 4) ? 1 : 0;
      },
      tiers: [{ goal: 1, reward: { type: 'points', value: 3 }, desc: "与月为伴的奋斗者" }],
    },
    earlyBird: {
      name: "早起的鸟儿",
      desc: "在清晨完成任务。",
      hidden: true,
      checkOn: ['task_complete'],
      getProgress: (trigger, data, db) => {
          const now = new Date();
          const hour = now.getHours();
          return (hour >= 5 && hour < 7) ? 1 : 0;
      },
      tiers: [{ goal: 1, reward: { type: 'points', value: 3 }, desc: "一日之计在于晨" }],
    },
    artOfDecluttering: {
      name: "断舍离",
      desc: "删除一个已创建的任务。",
      hidden: true,
      checkOn: ['task_delete'],
      getProgress: () => 1,
      tiers: [{ goal: 1, reward: { type: 'points', value: 1 }, desc: "学会放弃也是一种智慧" }],
    },
};

export const SHOP_ITEM_POOL = [
  { cost: 1, type: 'limit', key: 'dailyMaxPerDay', name: '每日限额+1' },
  { cost: 1, type: 'limit', key: 'dailyMaxSimultaneous', name: '每日并行+1' },
  { cost: 5, type: 'limit', key: 'weeklyMaxPerWeek', name: '每周限额+1' },
  { cost: 5, type: 'limit', key: 'weeklyMaxSimultaneous', name: '每周并行+1' },
  { cost: 10, type: 'limit', key: 'monthlyMaxPerMonth', name: '每月限额+1' },
  { cost: 10, type: 'limit', key: 'monthlyMaxSimultaneous', name: '每月并行+1' },
];

export let state = {
  msPerPx: 60 * 1000,
  viewportStart: new Date(),
  editingTask: null,
  reportingTask: null,
  popoverTask: null,
};

const foodData = {
    "北京": ["卤煮火烧", "豆汁儿", "焦圈", "炸灌肠", "驴打滚", "艾窝窝", "糖火烧", "炒肝", "爆肚", "炸咯吱"],
    "天津": ["狗不理包子", "耳朵眼炸糕", "十八街麻花", "煎饼果子", "馄饨李", "锅巴菜", "糖堆儿", "熟梨糕", "贴饼子", "嘎巴菜"],
    "上海": ["生煎", "小笼馒头", "排骨年糕", "葱油拌面", "蟹壳黄", "糍饭团", "酒酿圆子", "四喜烤麸", "素鸡", "海棠糕"],
    "重庆": ["重庆小面", "酸辣粉", "山城凉面", "毛血旺", "烧烤串串", "渣宰", "糍粑", "合川桃片", "豆花", "凉粉"],
    "河北": ["驴肉火烧", "保定驴排", "沧州火锅鸡", "石家庄炸鸡", "唐山蜂蜜麻糖", "赵州驴肉", "宣化牛奶葡萄干饼", "柏各庄大饼", "藁城宫面", "河间驴肉火烧"],
    "山西": ["刀削面", "猫耳朵", "莜面栲栳栳", "过油肉", "头脑", "平遥牛肉", "太谷饼", "碗秃", "油糕", "剔尖"],
    "辽宁": ["铁岭锅包肉", "沈阳鸡架", "老四季抻面", "本溪小市羊汤", "海城馅饼", "大连焖子", "奶糕", "朝阳碗托", "鲅鱼饺子", "稻花香小粘豆包"],
    "吉林": ["朝鲜冷面", "锅包肉（吉林版）", "延吉米肠", "打糕", "辣白菜饺子", "乌拉火腿", "榆树钱饼", "松原查干湖鱼", "白城酸菜", "通化葡萄馅饼"],
    "黑龙江": ["锅包肉（哈尔滨）", "杀猪菜", "红肠", "大列巴", "粘豆包", "得莫利炖鱼", "马迭尔冰棍", "小鸡炖蘑菇", "冻梨", "灰菜馅饼"],
    "江苏": ["鸭血粉丝汤", "狮子头", "阳春面", "灌汤包", "蟹粉小笼", "无锡小笼", "扬州三丁包", "盐水鸭", "常州大麻糕", "南京梅花糕"],
    "浙江": ["片儿川", "油焖春笋", "定胜糕", "嘉兴粽子", "宁波汤圆", "温州瘦肉丸", "金华酥饼", "台州豆腐乳饼", "杭州葱包桧", "舟山海鲜面"],
    "安徽": ["臭鳜鱼（小吃化）", "毛豆腐", "徽州臭豆腐", "符离集烧鸡", "太和板面", "蚌埠小笼", "合肥牛肉包", "巢湖银鱼煎饼", "马祥兴牛肉汤", "桐城小花生糖"],
    "福建": ["沙茶面", "肉燕", "拌面线", "鱼丸", "土笋冻", "扁食", "烧仙草", "花生汤", "薄饼", "佛跳墙（简餐版）"],
    "江西": ["瓦罐汤", "米粉（南昌拌粉）", "藜蒿炒腊肉（快餐）", "军山湖螺狮粉（地方版）", "三杯鸡（小吃档）", "江西炒粉", "庐山石耳煎饼", "景德镇冷粉", "赣州鱼饼", "抚州泡粉"],
    "山东": ["煎饼卷大葱", "博山炸肉", "德州扒鸡（即食）", "潍坊肉火烧", "烟台焖子", "青岛辣酱面", "章丘葱花饼", "临沂糁汤", "济南把子肉", "糖酥煎饼"],
    "河南": ["胡辣汤", "烩面", "逍遥镇胡辣汤", "开封小笼灌汤包", "道口烧鸡", "羊肉烩面", "浆面条", "油旋", "蒸面", "双汇烤肠（街头）"],
    "湖北": ["热干面", "豆皮", "三鲜豆皮", "精武鸭脖", "襄阳牛肉面", "宜昌三峡苕粉", "孝感米酒", "潜江小龙虾（夜宵）", "沔阳三蒸", "武昌鱼（简餐）"],
    "湖南": ["臭豆腐（长沙）", "剁椒鱼头（快餐）", "糖油粑粑", "米粉（长沙/常德）", "口味虾", "茶颜悦色糕点", "酱板鸭", "扎粉", "外婆菜饼", "捆鸡"],
    "广东": ["肠粉", "云吞面", "艇仔粥", "烧腊饭", "猪肠粉", "鸡仔饼", "双皮奶", "钵仔糕", "煲仔饭", "牛杂"],
    "广西": ["螺蛳粉", "老友粉", "卷筒粉", "酸笋鸭脚", "马肉米粉（靖西）", "桂林米粉", "椰子冻", "油茶", "芋头糕", "卷粉"],
    "海南": ["清补凉", "文昌鸡饭", "海南粉", "抱罗粉", "后安粉", "椰子饭", "炸虾饼", "煎堆", "薏米水", "海鲜粥"],
    "四川": ["担担面", "肥肠粉", "冒菜", "钵钵鸡", "串串香", "凉粉（绵阳米粉）", "军屯锅盔", "赖汤圆", "张飞牛肉（即食）", "双流老妈兔头"],
    "贵州": ["肠旺面", "丝娃娃", "豆米火锅", "遵义羊肉粉", "花溪牛肉粉", "凯里酸汤鱼（快餐）", "雷山腌鱼", "恋爱豆腐果", "苗王粑粑", "枫香染饼"],
    "云南": ["过桥米线", "小锅米线", "汽锅鸡（小份）", "烤乳扇", "鲜花饼", "凉米线", "大救驾", "建水烧豆腐", "宣威火腿月饼", "糯米糕"],
    "西藏": ["糌粑", "酥油茶", "风干牦牛肉", "青稞饼", "包席", "藏式饺子（莫莫）", "酸奶", "土豆包子", "酥油糌粑糖", "甜茶点心"],
    "陕西": ["肉夹馍", "凉皮", "biangbiang面", "羊肉泡馍", "臊子面", "水盆羊肉", "岐山擀面", "甑糕", "镜糕", "胡辣汤（关中）"],
    "甘肃": ["牛肉面（兰州拉面）", "灰豆子", "甜醅", "搓鱼面", "臊子面（天水）", "嘉峪关烤肉", "敦煌驴肉黄面", "张掖臊子面", "百合糕", "酿皮"],
    "青海": ["手抓羊肉", "酸奶", "甜醅子", "尕面片", "羊肚手抓", "青海老酸奶雪糕", "牦牛酸奶糍粑", "青稞饼", "酿皮（西宁）", "油馍馍"],
    "宁夏": ["羊杂碎", "手抓羊肉", "枸杞饸饹", "滩羊肉串", "黄渠桥羊羔肉", "荞麦冷面", "灌肠", "羊肉泡馍（宁夏风）", "油香", "酿皮"],
    "新疆": ["烤馕", "手抓饭", "羊肉串", "馕包肉", "卡瓦斯", "抓饭包子", "椒麻鸡（哈密风）", "西瓜冰棍", "杏干酸奶", "拉条子"],
    "内蒙古": ["手把肉", "焙子", "奶皮子", "酸奶饼", "莜面", "牛肉干", "风干牛肉", "奶豆腐", "烧麦（包头）", "奶茶饼"],
    "香港": ["菠萝包", "肠粉（港式）", "鸡蛋仔", "丝袜奶茶", "车仔面", "碗仔翅", "西多士", "艇仔粥（港式）", "手撕鸡饭", "煲仔饭（港式）"],
    "澳门": ["葡挞", "猪扒包", "马介休球", "水蟹粥", "豉汁蒸凤爪", "咖喱牛腩面", "猪手面", "木糠布丁", "杏仁饼", "猪扒包（氹仔）"],
    "台湾": ["大肠包小肠", "盐酥鸡", "蚵仔煎", "刈包", "卤肉饭", "牛肉面（台式）", "珍珠奶茶", "花生卷冰淇淋", "凤梨酥", "葱抓饼"],
    "重庆（辖区细分）": ["江津米花糖", "合川肉片", "涪陵榨菜小面", "荣昌卤白鹅", "梁平张鸭子", "万州烤鱼", "永川豆豉拌面", "大足黑山羊汤", "綦江米粉", "彭水苗族酸汤"],
    "四川（州县）": ["自贡冷吃兔", "资中鲜锅兔", "宜宾燃面", "乐山甜皮鸭", "德阳酥饼", "内江牛肉面", "遂宁龙须面", "南充米粉", "广安麻辣鸡", "攀枝花米粉"],
    "广东（城市）": ["潮汕牛肉丸", "潮汕粿条", "梅州盐焗鸡", "湛江白切鸡", "佛山盲公丸", "肇庆裹蒸粽", "顺德双皮奶", "中山沙溪凉茶", "阳江鱼丸", "惠州梅菜饼"],
    "云南（州县）": ["丽江粑粑", "大理喜洲粑粑", "保山烧饵块", "曲靖小粑粑", "腾冲大救驾", "香格里拉青稞饼", "蒙自过桥米线", "怒江撒撇", "文山米线", "红河米线"],
    "广西（市县）": ["柳州螺蛳粉", "南宁老友粉", "钦州卷粉", "北海鱼丸粉", "桂林桂花糕", "梧州龟苓膏", "来宾金秀油茶", "河池糯米饭", "崇左牛腩粉", "百色酸辣粉"],
    "山东（城市）": ["博山豆腐箱", "周村烧饼", "莱阳梨膏糖", "蓬莱小面", "青岛锅贴", "潍坊朝天锅", "临清烧饼", "曲阜馇条", "滕州菜煎饼", "东营焖子"],
    "河南（地市）": ["信阳热干面（地方版）", "南阳牛肉汤", "周口逍遥镇胡辣汤", "安阳粉浆饭", "洛阳水席（简餐）", "新乡烧鸡", "开封桶子鸡", "焦作油茶", "许昌饸饹面", "商丘羊肉烩面"],
};

// --- START: MODIFICATION (美食价格提升) ---
export const LIMITED_FOOD_ITEMS = Object.entries(foodData).flatMap(([province, foods]) => 
    foods.map(foodName => ({
        id: `${province}_${foodName}`.replace(/\s+/g, '_').replace(/[（）]/g, ''),
        name: foodName,
        province: province,
        cost: 5, // <--- 价格从 3 提升到 5
        desc: "使用后AP上限+1",
        effect: { type: 'ap_cap_base', value: 1 }
    }))
);
// --- END: MODIFICATION (美食价格提升) ---

// 1. 定义美食及其诗意成就名 (完整版 - 2024优化版)
const CUSTOM_FOOD_ACHIEVEMENT_NAMES = {
    // === 华北 & 东北 ===
    '北京_卤煮火烧': { name: '南城旧味' }, '北京_豆汁儿': { name: '甘之如饴' }, '北京_焦圈': { name: '金环伴饮' },
    '北京_炸灌肠': { name: '碎金蒜香' }, '北京_驴打滚': { name: '御苑甜尘' }, '北京_艾窝窝': { name: '雪糯山楂' },
    '北京_糖火烧': { name: '红糖暖心' }, '北京_炒肝': { name: '鼓楼晨味' }, '北京_爆肚': { name: '水爆功深' },
    '北京_炸咯吱': { name: '金殿脆响' },
    '天津_狗不理包子': { name: '津门首绝' }, '天津_耳朵眼炸糕': { name: '沽上流金' }, '天津_十八街麻花': { name: '桂发祥馨' },
    '天津_煎饼果子': { name: '沽上晨光' }, '天津_馄饨李': { name: '骨汤鲜影' }, '天津_锅巴菜': { name: '码头晨炊' },
    '天津_糖堆儿': { name: '冰糖葫芦' }, '天津_熟梨糕': { name: '梨园清韵' }, '天津_贴饼子': { name: '渔家金黄' },
    '天津_嘎巴菜': { name: '绿豆醇卤' },
    '河北_驴肉火烧': { name: '古道热肠' }, '河北_保定驴排': { name: '直隶官府' }, '河北_沧州火锅鸡': { name: '铁狮雄风' },
    '河北_石家庄炸鸡': { name: '燕赵之味' }, '河北_唐山蜂蜜麻糖': { name: '冀东甜梦' }, '河北_赵州驴肉': { name: '古桥遗风' },
    '河北_宣化牛奶葡萄干饼': { name: '龙眼葡香' }, '河北_柏各庄大饼': { name: '渤海质朴' }, '河北_藁城宫面': { name: '龙凤呈祥' },
    '河北_河间驴肉火烧': { name: '火烧真味' },
    '山西_刀削面': { name: '面里藏锋' }, '山西_猫耳朵': { name: '晋祠巧手' }, '山西_莜面栲栳栳': { name: '雁门叠翠' },
    '山西_过油肉': { name: '三晋醋意' }, '山西_头脑': { name: '傅山风骨' }, '山西_平遥牛肉': { name: '古城酱韵' },
    '山西_太谷饼': { name: '晋商干粮' }, '山西_碗秃': { name: '柳林风情' }, '山西_油糕': { name: '黄米金镶' },
    '山西_剔尖': { name: '拨弄风云' },
    '内蒙古_手把肉': { name: '草原英雄' }, '内蒙古_焙子': { name: '敕勒川味' }, '内蒙古_奶皮子': { name: '白云凝脂' },
    '内蒙古_酸奶饼': { name: '牛羊诗篇' }, '内蒙古_莜面': { name: '阴山风物' }, '内蒙古_牛肉干': { name: '风之印记' },
    '内蒙古_风干牛肉': { name: '马背粮仓' }, '内蒙古_奶豆腐': { name: '草原奶酪' }, '内蒙古_烧麦包头': { name: '鹿城晨曦' },
    '内蒙古_奶茶饼': { name: '咸香温暖' },
    '辽宁_铁岭锅包肉': { name: '铁岭风云' }, '辽宁_沈阳鸡架': { name: '奉天风骨' }, '辽宁_老四季抻面': { name: '鸡汤暖京' },
    '辽宁_本溪小市羊汤': { name: '枫林渡暖' }, '辽宁_海城馅饼': { name: '牛庄旧梦' }, '辽宁_大连焖子': { name: '渤海明珠' },
    '辽宁_奶糕': { name: '辽河雪韵' }, '辽宁_朝阳碗托': { name: '三燕古味' }, '辽宁_鲅鱼饺子': { name: '渔港祝福' },
    '辽宁_稻花香小粘豆包': { name: '黑土馈赠' },
    '吉林_朝鲜冷面': { name: '长白镜泉' }, '吉林_锅包肉吉林版': { name: '雾凇琼花' }, '吉林_延吉米肠': { name: '图们江畔' },
    '吉林_打糕': { name: '月下碓声' }, '吉林_辣白菜饺子': { name: '火辣温柔' }, '吉林_乌拉火腿': { name: '松江记忆' },
    '吉林_榆树钱饼': { name: '春风滋味' }, '吉林_松原查干湖鱼': { name: '冰湖腾鱼' }, '吉林_白城酸菜': { name: '鹤乡酸爽' },
    '吉林_通化葡萄馅饼': { name: '山城甜蜜' },
    '黑龙江_锅包肉哈尔滨': { name: '冰城序曲' }, '黑龙江_杀猪菜': { name: '雪乡家宴' }, '黑龙江_红肠': { name: '远东之味' },
    '黑龙江_大列巴': { name: '果木坚实' }, '黑龙江_粘豆包': { name: '关东腊月' }, '黑龙江_得莫利炖鱼': { name: '江豆腐鲜' },
    '黑龙江_马迭尔冰棍': { name: '中央大街' }, '黑龙江_小鸡炖蘑菇': { name: '林海雪原' }, '黑龙江_冻梨': { name: '霜天甘露' },
    '黑龙江_灰菜馅饼': { name: '田埂童年' },

    // === 华东 ===
    '上海_生煎': { name: '沪上半两' }, '上海_小笼馒头': { name: '玲珑汤包' }, '上海_排骨年糕': { name: '十里洋场' },
    '上海_葱油拌面': { name: '弄堂飘香' }, '上海_蟹壳黄': { name: '石库门酥' }, '上海_糍饭团': { name: '晨安上海' },
    '上海_酒酿圆子': { name: '桂花甜梦' }, '上海_四喜烤麸': { name: '本帮素锦' }, '上海_素鸡': { name: '豆香年华' },
    '上海_海棠糕': { name: '一朵海棠' },
    '江苏_鸭血粉丝汤': { name: '金陵一碗' }, '江苏_狮子头': { name: '扬州风月' }, '江苏_阳春面': { name: '江南清汤' },
    '江苏_灌汤包': { name: '淮扬精粹' }, '江苏_蟹粉小笼': { name: '秋风恩赐' }, '江苏_无锡小笼': { name: '太湖甜心' },
    '江苏_扬州三丁包': { name: '三鲜归一' }, '江苏_盐水鸭': { name: '桂香秦淮' }, '江苏_常州大麻糕': { name: '龙城香酥' },
    '江苏_南京梅花糕': { name: '状元及第' },
    '浙江_片儿川': { name: '西湖映雪' }, '浙江_油焖春笋': { name: '钱塘春信' }, '浙江_定胜糕': { name: "宋时捷报" },
    '浙江_嘉兴粽子': { name: '五芳斋香' }, '浙江_宁波汤圆': { name: '缸鸭狗甜' }, '浙江_温州瘦肉丸': { name: '瓯越风味' },
    '浙江_金华酥饼': { name: '八婺金脆' }, '浙江_台州豆腐乳饼': { name: '海门卫忆' }, '浙江_杭州葱包桧': { name: '望仙桥畔' },
    '浙江_舟山海鲜面': { name: '东海渔火' },
    '安徽_臭鳜鱼小吃化': { name: '时间的味' }, '安徽_毛豆腐': { name: '徽州风物' }, '安徽_徽州臭豆腐': { name: '闻香识府' },
    '安徽_符离集烧鸡': { name: '京沪记忆' }, '安徽_太和板面': { name: '皖北硬朗' }, '安徽_蚌埠小笼': { name: '淮上明珠' },
    '安徽_合肥牛肉包': { name: '庐州风味' }, '安徽_巢湖银鱼煎饼': { name: '八百里帆' }, '安徽_马祥兴牛肉汤': { name: '江淮晨露' },
    '安徽_桐城小花生糖': { name: '文都甜香' },
    '福建_沙茶面': { name: '鹭岛风情' }, '福建_肉燕': { name: '三山福韵' }, '福建_拌面线': { name: '八闽素心' },
    '福建_鱼丸': { name: '七星之味' }, '福建_土笋冻': { name: '滩涂馈赠' }, '福建_扁食': { name: '榕城小调' },
    '福建_烧仙草': { name: '闽南清凉' }, '福建_花生汤': { name: '泉州甜梦' }, '福建_薄饼': { name: '春卷前身' },
    '福建_佛跳墙简餐版': { name: '坛启荤香' },
    '江西_瓦罐汤': { name: '滕王阁晨' }, '江西_米粉南昌拌粉': { name: '赣江之韵' }, '江西_藜蒿炒腊肉快餐': { name: '鄱湖之春' },
    '江西_军山湖螺狮粉地方版': { name: '湖鲜变奏' }, '江西_三杯鸡小吃档': { name: '宁都三杯' }, '江西_江西炒粉': { name: '锅气十足' },
    '江西_庐山石耳煎饼': { name: '匡庐石语' }, '江西_景德镇冷粉': { name: '瓷都夏日' }, '江西_赣州鱼饼': { name: '客家风情' },
    '江西_抚州泡粉': { name: '才子之乡' },
    '山东_煎饼卷大葱': { name: '泰山风骨' }, '山东_博山炸肉': { name: '鲁菜本色' }, '山东_德州扒鸡': { name: '五香脱骨' },
    '山东_潍坊肉火烧': { name: '鸢都烟火' }, '山东_烟台焖子': { name: '蓬莱仙味' }, '山东_青岛辣酱面': { name: '海滨之夏' },
    '山东_章丘葱花饼': { name: '女郎山下' }, '山东_临沂糁汤': { name: '琅琊晨光' }, '山东_济南把子肉': { name: '泉城豪情' },
    '山东_糖酥煎饼': { name: '沂蒙甜脆' },

    // === 华中 & 华南 ===
    '河南_胡辣汤': { name: '中原破晓' }, '河南_烩面': { name: '黄河之水' }, '河南_逍遥镇胡辣汤': { name: '道法自然' },
    '河南_开封小笼灌汤包': { name: '汴京一梦' }, '河南_道口烧鸡': { name: '义兴张传' }, '河南_羊肉烩面': { name: '牧野之风' },
    '河南_浆面条': { name: '洛水酸醇' }, '河南_油旋': { name: '古都酥香' }, '河南_蒸面': { name: '焖之劲道' },
    '河南_双汇烤肠街头': { name: '时代印记' },
    '湖北_热干面': { name: '江城过早' }, '湖北_豆皮': { name: '三镇晨光' }, '湖北_三鲜豆皮': { name: '糯米黄金' },
    '湖北_精武鸭脖': { name: '九省通衢' }, '湖北_襄阳牛肉面': { name: '江湖码头' }, '湖北_宜昌三峡苕粉': { name: '西陵峡韧' },
    '湖北_孝感米酒': { name: '澴水甜香' }, '湖北_潜江小龙虾夜宵': { name: '油焖夏夜' }, '湖北_沔阳三蒸': { name: '粉蒸智慧' },
    '湖北_武昌鱼简餐': { name: '才饮长沙' },
    '湖南_臭豆腐长沙': { name: '闻臭寻香' }, '湖南_剁椒鱼头': { name: '湘江红浪' }, '湖南_糖油粑粑': { name: '市井甜蜜' },
    '湖南_米粉长沙常德': { name: '一碗乡愁' }, '湖南_口味虾': { name: '星城之夜' }, '湖南_茶颜悦色糕点': { name: '国风新韵' },
    '湖南_酱板鸭': { name: '三湘腊味' }, '湖南_扎粉': { name: '醴陵风物' }, '湖南_外婆菜饼': { name: '湘西记忆' },
    '湖南_捆鸡': { name: '豆皮艺术' },
    '广东_肠粉': { name: '岭南晨曲' }, '广东_云吞面': { name: '西关风情' }, '广东_艇仔粥': { name: '荔湾船歌' },
    '广东_烧腊饭': { name: '广府烟火' }, '广东_猪肠粉': { name: '珠江素裹' }, '广东_鸡仔饼': { name: '甘香回忆' },
    '广东_双皮奶': { name: '顺德温柔' }, '广东_钵仔糕': { name: '童年水晶' }, '广东_煲仔饭': { name: '炭火传香' },
    '广东_牛杂': { name: '街角香气' },
    '广西_螺蛳粉': { name: '龙城闻香' }, '广西_老友粉': { name: '邕城记忆' }, '广西_卷筒粉': { name: '壮乡晨韵' },
    '广西_酸笋鸭脚': { name: '酸辣之魂' }, '广西_马肉米粉靖西': { name: '边关风味' }, '广西_桂林米粉': { name: '漓江之水' },
    '广西_椰子冻': { name: '南国清甜' }, '广西_油茶': { name: '瑶寨问候' }, '广西_芋头糕': { name: '荔浦厚礼' },
    '广西_卷粉': { name: '石磨艺术' },
    '海南_清补凉': { name: '琼崖甘露' }, '海南_文昌鸡饭': { name: '椰风海韵' }, '海南_海南粉': { name: '琼州首粉' },
    '海南_抱罗粉': { name: '文昌故事' }, '海南_后安粉': { name: '万宁清晨' }, '海南_椰子饭': { name: '天涯祝福' },
    '海南_炸虾饼': { name: '渔港酥脆' }, '海南_煎堆': { name: '金玉满堂' }, '海南_薏米水': { name: '南洋清凉' },
    '海南_海鲜粥': { name: '南海鲜甜' },

    // === 西南 & 西北 ===
    '四川_担担面': { name: '蓉城挑夫' }, '四川_肥肠粉': { name: '锦城腴香' }, '四川_冒菜': { name: '沸汤琳琅' },
    '四川_钵钵鸡': { name: '乐山乐水' }, '四川_串串香': { name: '竹签江湖' }, '四川_凉粉绵阳米粉': { name: '蜀道清风' },
    '四川_军屯锅盔': { name: '将帅点心' }, '四川_赖汤圆': { name: '锦江春色' }, '四川_张飞牛肉即食': { name: '阆中传奇' },
    '四川_双流老妈兔头': { name: '麻辣亲吻' },
    '重庆_重庆小面': { name: '山城一碗' }, '重庆_酸辣粉': { name: '巴渝酸爽' }, '重庆_山城凉面': { name: '雾都清凉' },
    '重庆_毛血旺': { name: '红油烈火' }, '重庆_烧烤串串': { name: '码头烟火' }, '重庆_渣宰': { name: '市井本味' },
    '重庆_糍粑': { name: '红糖热糯' }, '重庆_合川桃片': { name: '三江薄脆' }, '重庆_豆花': { name: '一碗嫩滑' },
    '重庆_凉粉': { name: '夏日冰晶' },
    '贵州_肠旺面': { name: '黔灵红' }, '贵州_丝娃娃': { name: '襁褓之春' }, '贵州_豆米火锅': { name: '甲秀楼暖' },
    '贵州_遵义羊肉粉': { name: '赤水河畔' }, '贵州_花溪牛肉粉': { name: '十里河滩' }, '贵州_凯里酸汤鱼快餐': { name: '苗寨之酸' },
    '贵州_雷山腌鱼': { name: '时光之作' }, '贵州_恋爱豆腐果': { name: '青岩约定' }, '贵州_苗王粑粑': { name: '糯米颂歌' },
    '贵州_枫香染饼': { name: '布依之蓝' },
    '云南_过桥米线': { name: '滇池传说' }, '云南_小锅米线': { name: '昆明市井' }, '云南_汽锅鸡小份': { name: '建水回响' },
    '云南_烤乳扇': { name: '苍山之雪' }, '云南_鲜花饼': { name: '春城伴手' }, '云南_凉米线': { name: '彩云之夏' },
    '云南_大救驾': { name: '永历餐桌' }, '云南_建水烧豆腐': { name: '临安炭火' }, '云南_宣威火腿月饼': { name: '乌蒙咸香' },
    '云南_糯米糕': { name: '傣家之甜' },
    '西藏_糌粑': { name: '雪域粮食' }, '西藏_酥油茶': { name: '高原温暖' }, '西藏_风干牦牛肉': { name: '冈仁波齐' },
    '西藏_青稞饼': { name: '圣城阳光' }, '西藏_包席': { name: '拉萨盛宴' }, '西藏_藏式饺子莫莫': { name: '喜马拉雅' },
    '西藏_酸奶': { name: '牧场馈赠' }, '西藏_土豆包子': { name: '河谷质朴' }, '西藏_酥油糌粑糖': { name: '童年之甜' },
    '西藏_甜茶点心': { name: '八廓午后' },
    '陕西_肉夹馍': { name: '秦川之风' }, '陕西_凉皮': { name: '汉中之柔' }, '陕西_biangbiang面': { name: '关中之宽' },
    '陕西_羊肉泡馍': { name: '长安之暖' }, '陕西_臊子面': { name: '岐山之酸' }, '陕西_水盆羊肉': { name: '渭水之鲜' },
    '陕西_岐山擀面': { name: '周原筋道' }, '陕西_甑糕': { name: '古都甜糯' }, '陕西_镜糕': { name: '一镜繁华' },
    '陕西_胡辣汤关中': { name: '秦川之晨' },
    '甘肃_牛肉面兰州拉面': { name: '金城清晨' }, '甘肃_灰豆子': { name: '黄河之甜' }, '甘肃_甜醅': { name: '陇上酒酿' },
    '甘肃_搓鱼面': { name: '丝路巧手' }, '甘肃_臊子面天水': { name: '麦积风味' }, '甘肃_嘉峪关烤肉': { name: '雄关炭火' },
    '甘肃_敦煌驴肉黄面': { name: '月泉念想' }, '甘肃_张掖臊子面': { name: '丹霞之彩' }, '甘肃_百合糕': { name: '兰山清甜' },
    '甘肃_酿皮': { name: '河西凉意' },
    '青海_手抓羊肉': { name: '昆仑盛宴' }, '青海_酸奶': { name: '青海湖凝' }, '青海_甜醅子': { name: '河湟甘醇' },
    '青海_尕面片': { name: '三江源味' }, '青海_羊肚手抓': { name: '草原珍馐' }, '青海_青海老酸奶雪糕': { name: '夏日雪山' },
    '青海_牦牛酸奶糍粑': { name: '牧人甜点' }, '青海_青稞饼': { name: '高原阳光' }, '青海_酿皮西宁': { name: '夏都凉爽' },
    '青海_油馍馍': { name: '古尔邦祝' },
    '宁夏_羊杂碎': { name: '塞上黎明' }, '宁夏_手抓羊肉': { name: '贺兰山鲜' }, '宁夏_枸杞饸饹': { name: '红宝祝福' },
    '宁夏_滩羊肉串': { name: '盐池馈赠' }, '宁夏_黄渠桥羊羔肉': { name: '大武口嫩' }, '宁夏_荞麦冷面': { name: '六盘山夏' },
    '宁夏_灌肠': { name: '银川市井' }, '宁夏_羊肉泡馍宁夏风': { name: '回乡风味' }, '宁夏_油香': { name: '开斋喜悦' },
    '宁夏_酿皮': { name: '凤城之凉' },
    '新疆_烤馕': { name: '天山之阳' }, '新疆_手抓饭': { name: '丝路米香' }, '新疆_羊肉串': { name: '火焰山热' },
    '新疆_馕包肉': { name: '大巴扎宴' }, '新疆_卡瓦斯': { name: '伊犁之蜜' }, '新疆_抓饭包子': { name: '和田智慧' },
    '新疆_椒麻鸡哈密风': { name: '东天山麻' }, '新疆_西瓜冰棍': { name: '吐鲁番甜' }, '新疆_杏干酸奶': { name: '帕米尔酸' },
    '新疆_拉条子': { name: '盘中舞者' },
    
    // === 港澳台 & 细分地区 ===
    '香港_菠萝包': { name: '冰火两重' }, '香港_肠粉港式': { name: '维港晨光' }, '香港_鸡蛋仔': { name: '街角童年' },
    '香港_丝袜奶茶': { name: '兰芳园醇' }, '香港_车仔面': { name: '奋斗之味' }, '香港_碗仔翅': { name: '平民盛宴' },
    '香港_西多士': { name: '茶餐厅午' }, '香港_艇仔粥港式': { name: '避风塘暖' }, '香港_手撕鸡饭': { name: '市井智慧' },
    '香港_煲仔饭港式': { name: '庙街炭火' },
    '澳门_葡挞': { name: '大三巴甜' }, '澳门_猪扒包': { name: '氹仔之风' }, '澳门_马介休球': { name: '葡国之魂' },
    '澳门_水蟹粥': { name: '濠江之鲜' }, '澳门_豉汁蒸凤爪': { name: '一盅两件' }, '澳门_咖喱牛腩面': { name: '十月初五' },
    '澳门_猪手面': { name: '妈阁之胶' }, '澳门_木糠布丁': { name: '沙滩甜品' }, '澳门_杏仁饼': { name: '手信情谊' },
    '澳门_猪扒包氹仔': { name: '离岛风味' },
    '台湾_大肠包小肠': { name: '夜市交响' }, '台湾_盐酥鸡': { name: '九份香气' }, '台湾_蚵仔煎': { name: '乡土之海' },
    '台湾_刈包': { name: '虎咬猪福' }, '台湾_卤肉饭': { name: '稻香慰藉' }, '台湾_牛肉面台式': { name: '宝岛浓情' },
    '台湾_珍珠奶茶': { name: '春水堂意' }, '台湾_花生卷冰淇淋': { name: '兰阳之春' }, '台湾_凤梨酥': { name: '金砖甜蜜' },
    '台湾_葱抓饼': { name: '眷村记忆' },
    '重庆辖区细分_江津米花糖': { name: '四面山脆' }, '重庆辖区细分_合川肉片': { name: '三江汇流' }, '重庆辖区细分_涪陵榨菜小面': { name: '乌江咸鲜' },
    '广东城市_潮汕牛肉丸': { name: '千锤百炼' }, '广东城市_梅州盐焗鸡': { name: '客家智慧' }, '广东城市_顺德双皮奶': { name: '凤城温柔' }
};

// --- START: MODIFICATION (移除特色美食成就奖励) ---
// 2. 程序化生成美食成就 (无奖励)
const generatedFoodAchievements = {};
LIMITED_FOOD_ITEMS.forEach(food => {
    const achId = `ach_food_${food.id}`;
    const achInfo = CUSTOM_FOOD_ACHIEVEMENT_NAMES[food.id] || { name: food.name };

    generatedFoodAchievements[achId] = {
        name: achInfo.name,
        desc: `品尝来自「${food.province}」的特色美食：${food.name}。`,
        hidden: true,
        checkOn: ['shop_purchase'],
        getProgress: (trigger, data, db) => {
            const purchased = db.meta.purchasedLimitedItems || [];
            return purchased.includes(food.id) ? 1 : 0;
        },
        tiers: [{
            goal: 1,
            // 奖励被移除，改为0积分，以保持数据结构一致性
            reward: { type: 'points', value: 0 },
            desc: `解锁成就`
        }]
    };
});
// --- END: MODIFICATION ---


// --- START: MODIFICATION (地区制霸成就系统升级) ---

// 3. 定义地区制霸成就的特色名称
const REGIONAL_ACHIEVEMENT_NAMES = {
    "北京": "京畿寻味", "天津": "津门食韵", "上海": "魔都食录", "重庆": "巴渝江湖",
    "河北": "燕赵遗风", "山西": "三晋醋意", "辽宁": "关东铁韵", "吉林": "林海雪原",
    "黑龙江": "北国风光", "江苏": "江南雅韵", "浙江": "钱塘风物", "安徽": "徽州风骨",
    "福建": "八闽寻珍", "江西": "赣鄱风味", "山东": "齐鲁食风", "河南": "中原鼎味",
    "湖北": "千湖之馔", "湖南": "三湘食韵", "广东": "南粤风华", "广西": "八桂奇珍",
    "海南": "琼崖风情", "四川": "天府百味", "贵州": "黔中百味", "云南": "彩云之肴",
    "西藏": "雪域天珍", "陕西": "三秦食记", "甘肃": "河西风物", "青海": "江源寻味",
    "宁夏": "塞上江南", "新疆": "西域风情", "内蒙古": "漠南风情", "香港": "香江食事",
    "澳门": "濠镜澳韵", "台湾": "宝岛食光",
};

// 4. 生成地区制霸成就 (附带丰厚奖励)
const generatedRegionalAchievements = {};
const provinces = [...new Set(LIMITED_FOOD_ITEMS.map(item => item.province))];

for (const province of provinces) {
    const achId = `region_${province.replace(/\s+/g, '_').replace(/[（）]/g, '')}`;
    const itemsInProvince = LIMITED_FOOD_ITEMS.filter(item => item.province === province);
    const achievementName = REGIONAL_ACHIEVEMENT_NAMES[province] || `老饕 · ${province}`;

    generatedRegionalAchievements[achId] = {
        name: achievementName,
        desc: `品尝完「${province}」所有特色美食，将大幅提升任务上限！`,
        hidden: false,
        checkOn: ['shop_purchase'],
        getProgress: (trigger, data, db) => {
            const purchased = new Set(db.meta.purchasedLimitedItems || []);
            const collectedCount = itemsInProvince.filter(item => purchased.has(item.id)).length;
            // 进度改为按收集数量计算，以在UI上提供反馈
            return collectedCount / itemsInProvince.length;
        },
        // 奖励通过多个层级（Tiers）实现，每个层级的目标都是1 (100%)
        // 这样可以利用现有系统，一次性发放所有奖励
        tiers: [
            { goal: 1, reward: { type: 'limit', key: 'dailyMaxPerDay', value: 1 }, desc: '每日创建上限+1' },
            { goal: 1, reward: { type: 'limit', key: 'dailyMaxSimultaneous', value: 1 }, desc: '每日并行上限+1' },
            { goal: 1, reward: { type: 'limit', key: 'weeklyMaxPerWeek', value: 1 }, desc: '每周创建上限+1' },
            { goal: 1, reward: { type: 'limit', key: 'weeklyMaxSimultaneous', value: 1 }, desc: '每周并行上限+1' },
            { goal: 1, reward: { type: 'limit', key: 'monthlyMaxPerMonth', value: 1 }, desc: '每月创建上限+1' },
            { goal: 1, reward: { type: 'limit', key: 'monthlyMaxSimultaneous', value: 1 }, desc: '每月并行上限+1' },
        ]
    };
}

// 5. 合并所有成就
export const ACHIEVEMENTS = {
    ...EXISTING_ACHIEVEMENTS,
    ...generatedFoodAchievements,
    ...generatedRegionalAchievements
};
// --- END: MODIFICATION ---