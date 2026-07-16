export type MaterialKnowledgeRule = {
  canonicalName: string;
  category: string;
  aliases: string[];
  ignoreSpec?: boolean;
};

export type MaterialKnowledgeMatch = {
  canonicalName: string;
  category: string;
  ignoreSpec: boolean;
  matchedAlias: string;
  confidence: number;
};

export const MATERIAL_KNOWLEDGE_RULES: MaterialKnowledgeRule[] = [
  { canonicalName: "吊钟组", category: "结构件", aliases: ["吊钟组", "吊钟", "吊盅", "吊盅组", "canopy"], ignoreSpec: true },
  { canonicalName: "吊杆组", category: "结构件", aliases: ["吊杆组", "吊杆", "吊管", "吊杆组5寸", "吊杆组8寸", "downrod"], ignoreSpec: true },
  { canonicalName: "灯盘组", category: "结构件", aliases: ["灯盘组", "灯盘", "底盘", "吸顶盘", "安装盘", "ceiling pan"], ignoreSpec: true },
  { canonicalName: "叶片组", category: "叶片组", aliases: ["叶片组", "叶片", "扇叶", "风叶", "blade"], ignoreSpec: true },
  { canonicalName: "内边框", category: "结构件", aliases: ["内边框", "内框", "边框", "inner frame"], ignoreSpec: false },
  { canonicalName: "塑料盖", category: "结构件", aliases: ["塑料盖", "塑胶盖", "胶盖", "plastic cover"], ignoreSpec: false },
  { canonicalName: "铝杆上", category: "结构件", aliases: ["铝杆上", "上铝杆", "铝杆上段"], ignoreSpec: false },
  { canonicalName: "铝杆下", category: "结构件", aliases: ["铝杆下", "下铝杆", "铝杆下段"], ignoreSpec: false },
  { canonicalName: "内杆", category: "结构件", aliases: ["内杆", "内管", "inner rod"], ignoreSpec: false },
  { canonicalName: "堵头", category: "结构件", aliases: ["堵头", "端盖", "塞头", "end cap"], ignoreSpec: false },
  { canonicalName: "灯头铝框", category: "结构件", aliases: ["灯头铝框", "铝框", "灯头框"], ignoreSpec: false },
  { canonicalName: "底座", category: "结构件", aliases: ["底座", "座子", "base"], ignoreSpec: false },
  { canonicalName: "驱动固定片", category: "结构件", aliases: ["驱动固定片", "驱动固定板", "电源固定片"], ignoreSpec: false },
  { canonicalName: "恒流板固定片", category: "结构件", aliases: ["恒流板固定片", "恒流板固定板", "电流板固定片"], ignoreSpec: false },
  { canonicalName: "旋钮开关", category: "结构件", aliases: ["旋扭开关", "旋钮开关", "旋钮", "knob switch"], ignoreSpec: false },
  { canonicalName: "铝灯头", category: "结构件", aliases: ["铝灯头", "灯头", "铝头", "灯杯", "铝杯"], ignoreSpec: false },
  { canonicalName: "散热器/铝件", category: "结构件", aliases: ["散热器", "铝件", "铝壳", "铝外壳", "型材", "heatsink"], ignoreSpec: false },
  { canonicalName: "外壳/壳体", category: "结构件", aliases: ["外壳", "壳体", "灯体", "塑壳", "塑胶壳", "housing", "case"], ignoreSpec: false },
  { canonicalName: "支架/固定件", category: "结构件", aliases: ["支架", "固定架", "固定件", "安装架", "挂板", "背板", "bracket"], ignoreSpec: false },
  { canonicalName: "面罩/装饰件", category: "结构件", aliases: ["面罩", "装饰盖", "装饰圈", "前盖", "后盖", "cover"], ignoreSpec: false },

  { canonicalName: "驱动", category: "驱动/控制器", aliases: ["驱动", "驱动器", "电源", "开关电源", "driver", "power supply"], ignoreSpec: false },
  { canonicalName: "控制器", category: "驱动/控制器", aliases: ["控制器", "控制板", "控制盒", "controller", "control box"], ignoreSpec: false },
  { canonicalName: "米家天线", category: "驱动/控制器", aliases: ["米家天线", "天线", "mijia antenna", "antenna"], ignoreSpec: false },
  { canonicalName: "遥控器", category: "驱动/控制器", aliases: ["遥控器", "遥控", "遥控手柄", "remote control", "remote"], ignoreSpec: false },
  { canonicalName: "接收器", category: "驱动/控制器", aliases: ["接收器", "接收头", "接收板", "receiver"], ignoreSpec: false },
  { canonicalName: "PCB/电路板", category: "驱动/控制器", aliases: ["pcb", "pcba", "电路板", "线路板", "基板"], ignoreSpec: false },
  { canonicalName: "端子排/端子座", category: "线材", aliases: ["端子排", "端子座", "接线端子", "terminal"], ignoreSpec: true },
  { canonicalName: "电线/线组", category: "线材", aliases: ["电线", "线组", "线材", "导线", "地线", "黄绿线", "端子线", "连接线", "wire", "cable"], ignoreSpec: true },
  { canonicalName: "PVC电子线", category: "线材", aliases: ["pvc电子线", "电子线", "pvc线"], ignoreSpec: false },
  { canonicalName: "DC电源线母头", category: "线材", aliases: ["dc5.5电源线母头", "电源线母头", "dc母头", "dc female cable"], ignoreSpec: false },
  { canonicalName: "DC电源线公母头", category: "线材", aliases: ["dc5.5电源线公母头", "dc5.5公母头", "电源线公母头", "dc公母头"], ignoreSpec: false },
  { canonicalName: "DC电源插座", category: "线材", aliases: ["dc5.5*2.1电源插座", "dc插座", "电源插座", "dc jack"], ignoreSpec: false },
  { canonicalName: "一字线夹", category: "线材", aliases: ["一字线夹", "线夹", "压线夹", "wire clip"], ignoreSpec: false },
  { canonicalName: "连接器", category: "驱动/控制器", aliases: ["连接器", "接插件", "插座", "插头", "connector", "conn"], ignoreSpec: false },
  { canonicalName: "电容", category: "驱动/控制器", aliases: ["电容", "capacitor", "cap"], ignoreSpec: false },
  { canonicalName: "电阻", category: "驱动/控制器", aliases: ["电阻", "resistor", "res"], ignoreSpec: false },
  { canonicalName: "IC/芯片", category: "驱动/控制器", aliases: ["ic", "芯片", "mcu", "chip"], ignoreSpec: false },
  { canonicalName: "电机", category: "电机", aliases: ["电机", "马达", "motor"], ignoreSpec: false },

  { canonicalName: "LED灯珠", category: "光源", aliases: ["led", "灯珠", "led灯珠", "smd", "2835", "3030", "5050", "3528", "5730"], ignoreSpec: false },
  { canonicalName: "光源板", category: "光源", aliases: ["光源板", "灯板", "led板", "cob", "光源", "light board"], ignoreSpec: false },
  { canonicalName: "PC扩散板", category: "光源", aliases: ["pc扩散板", "扩散板", "扩散罩", "扩散片", "diffuser"], ignoreSpec: false },
  { canonicalName: "PC凌晶片", category: "光源", aliases: ["pc凌晶片", "凌晶片", "棱晶片", "prismatic sheet"], ignoreSpec: false },
  { canonicalName: "铝基板", category: "光源", aliases: ["铝基板", "铝基线路板", "al pcb", "mcpcb"], ignoreSpec: false },
  { canonicalName: "贴片费", category: "光源", aliases: ["贴片费", "贴片加工", "smt", "smt fee"], ignoreSpec: true },
  { canonicalName: "光学透镜", category: "光源", aliases: ["光学透镜", "透镜", "lens"], ignoreSpec: false },
  { canonicalName: "扩散板/扩散罩", category: "光源", aliases: ["扩散板", "扩散罩", "扩散片", "diffuser"], ignoreSpec: false },
  { canonicalName: "反光杯/反射器", category: "光源", aliases: ["反光杯", "反射器", "反射罩", "reflector"], ignoreSpec: false },

  { canonicalName: "五金包", category: "五金", aliases: ["五金包", "五金包组", "螺丝包", "安装包", "hardware kit"], ignoreSpec: true },
  { canonicalName: "螺丝", category: "五金", aliases: ["螺丝", "螺钉", "机牙螺丝", "自攻螺丝", "screw"], ignoreSpec: false },
  { canonicalName: "内六角沉头螺丝", category: "五金", aliases: ["内六角沉头螺丝", "沉头螺丝", "内六角螺丝"], ignoreSpec: false },
  { canonicalName: "六角扳手", category: "五金", aliases: ["六角扳手", "内六角扳手", "扳手", "allen key"], ignoreSpec: false },
  { canonicalName: "螺母", category: "五金", aliases: ["螺母", "螺帽", "nut"], ignoreSpec: false },
  { canonicalName: "垫片", category: "五金", aliases: ["垫片", "平垫", "弹垫", "washer"], ignoreSpec: false },

  { canonicalName: "纸箱/外箱", category: "包装", aliases: ["纸箱", "外箱", "箱子", "carton", "master carton"], ignoreSpec: false },
  { canonicalName: "彩盒/包装盒", category: "包装", aliases: ["彩盒", "包装盒", "内盒", "color box", "box"], ignoreSpec: false },
  { canonicalName: "包装袋", category: "包装", aliases: ["包装袋", "塑胶袋", "胶袋", "po袋", "p.o袋", "pe袋", "p.e袋", "bag"], ignoreSpec: true },
  { canonicalName: "无纺布袋", category: "包装", aliases: ["无纺布袋", "布袋", "nonwoven bag"], ignoreSpec: false },
  { canonicalName: "泡棉/泡沫", category: "包装", aliases: ["泡棉", "泡沫", "珍珠棉", "epe", "eps", "foam"], ignoreSpec: false },
  { canonicalName: "说明书", category: "包装", aliases: ["说明书", "说明书组", "manual", "instruction"], ignoreSpec: true },
  { canonicalName: "标签", category: "包装", aliases: ["标签", "贴纸", "铭牌", "label", "sticker"], ignoreSpec: false },
  { canonicalName: "外箱标", category: "包装", aliases: ["外箱标", "箱唛", "外箱标签", "carton label"], ignoreSpec: false },
  { canonicalName: "防伪标", category: "包装", aliases: ["防伪标", "防伪标签", "anti fake label"], ignoreSpec: false },
  { canonicalName: "胶带/封箱胶", category: "包装", aliases: ["胶带", "封箱胶", "透明胶", "tape"], ignoreSpec: false },

  { canonicalName: "喷涂/烤漆", category: "表面处理", aliases: ["喷涂", "烤漆", "喷粉", "表面处理", "coating", "painting"], ignoreSpec: true },
  { canonicalName: "电镀/氧化", category: "表面处理", aliases: ["电镀", "氧化", "阳极", "anodize", "plating"], ignoreSpec: true },
  { canonicalName: "模具/治具", category: "模具/治具", aliases: ["模具", "治具", "夹具", "tooling", "fixture", "mold"], ignoreSpec: true },
  { canonicalName: "物流/损耗", category: "物流/损耗", aliases: ["物流", "运输", "运费", "损耗", "耗损", "freight", "shipping", "loss"], ignoreSpec: true },
  { canonicalName: "防滑脚垫", category: "杂项", aliases: ["防滑脚垫", "脚垫", "防滑垫", "rubber foot", "foot pad"], ignoreSpec: false },
  { canonicalName: "胶水", category: "杂项", aliases: ["胶水", "胶", "粘胶", "glue", "adhesive"], ignoreSpec: false },
  { canonicalName: "工业酒精", category: "杂项", aliases: ["工业酒精", "酒精", "清洁酒精", "alcohol"], ignoreSpec: false },
  { canonicalName: "人工", category: "人工", aliases: ["人工", "工时", "组装", "装配", "labor"], ignoreSpec: true },
  { canonicalName: "管理费", category: "人工/管理/利润", aliases: ["管理费", "管理", "overhead"], ignoreSpec: true },
  { canonicalName: "利润", category: "人工/管理/利润", aliases: ["利润", "毛利", "profit"], ignoreSpec: true },
  { canonicalName: "人工/管理/利润", category: "人工/管理/利润", aliases: ["人工管理费", "人工/管理", "人工及管理", "人工管理利润", "人工/管理/利润"], ignoreSpec: true },
  { canonicalName: "材料成本合计", category: "材料成本合计", aliases: ["材料成本合计", "物料成本", "原材料成本", "材料合计", "物料合计", "bom合计", "总材料"], ignoreSpec: true },
  { canonicalName: "出厂价", category: "出厂价", aliases: ["出厂价", "工厂价", "含税出厂", "factory"], ignoreSpec: true }
];

const CATEGORY_ALIASES: Record<string, string[]> = {
  结构件: ["结构", "结构件", "灯体", "外壳", "壳体", "铝件", "塑件", "支架", "底盘"],
  "驱动/控制器": ["驱动", "控制器", "控制", "米家天线", "天线", "电子", "电子料", "pcb", "pcba", "电路"],
  光源: ["光源", "光电", "灯珠", "led", "cob", "透镜", "扩散"],
  线材: ["线材", "电线", "电子线", "电源线", "插座", "线夹"],
  包装: ["包装", "包装部分", "纸箱", "彩盒", "泡棉", "泡沫"],
  五金: ["五金", "五金包", "螺丝", "螺母", "垫片", "扳手"],
  电机: ["电机", "马达", "motor"],
  杂项: ["杂项", "辅料", "脚垫", "胶水", "酒精"],
  表面处理: ["表面", "喷涂", "电镀", "氧化", "烤漆", "处理"],
  "模具/治具": ["模具", "治具", "夹具"],
  "物流/损耗": ["物流", "运输", "损耗", "运费"],
  人工: ["人工", "工时", "组装", "装配"],
  "人工/管理/利润": ["人工管理", "管理费", "利润", "毛利"],
  材料成本合计: ["材料成本合计", "物料成本", "原材料成本", "材料合计", "物料合计"],
  出厂价: ["出厂价", "工厂价"]
};

export function findMaterialKnowledgeMatch(value: string): MaterialKnowledgeMatch | null {
  const compact = compactText(value);
  if (!compact) return null;

  const candidates = MATERIAL_KNOWLEDGE_RULES.flatMap((rule) =>
    rule.aliases.map((alias) => {
      const compactAlias = compactText(alias);
      const matched = compact === compactAlias || compact.includes(compactAlias) || compactAlias.includes(compact);
      if (!matched) return null;
      const exactBonus = compact === compactAlias ? 40 : 0;
      return {
        canonicalName: rule.canonicalName,
        category: rule.category,
        ignoreSpec: Boolean(rule.ignoreSpec),
        matchedAlias: alias,
        confidence: Math.min(100, compactAlias.length * 8 + exactBonus)
      };
    })
  ).filter((item): item is MaterialKnowledgeMatch => item !== null);

  return candidates.sort((a, b) => b.confidence - a.confidence || b.matchedAlias.length - a.matchedAlias.length)[0] ?? findGenericMaterialMatch(compact);
}

export function findCategoryKnowledgeMatch(...values: unknown[]): string {
  const compact = compactText(values.join(" "));
  if (!compact) return "";

  const materialMatch = findMaterialKnowledgeMatch(compact);
  if (materialMatch?.category) return materialMatch.category;

  return findCategoryAliasMatch(compact);
}

export function findCategoryAliasMatch(...values: unknown[]): string {
  const compact = compactText(values.join(" "));
  if (!compact) return "";

  const category = Object.entries(CATEGORY_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => {
      const compactAlias = compactText(alias);
      return compact === compactAlias || compact.includes(compactAlias);
    })
  );
  return category?.[0] ?? "";
}

export function isKnownCategoryLabel(value: string): boolean {
  return Boolean(findCategoryAliasMatch(value));
}

function compactText(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[（）()[\]{}【】]/g, "")
    .replace(/[^\p{Script=Han}a-z0-9/]+/giu, "");
}

function findGenericMaterialMatch(compact: string): MaterialKnowledgeMatch | null {
  const structuralShape = matchStructuralShape(compact);
  if (structuralShape) {
    return {
      canonicalName: structuralShape,
      category: "结构件",
      ignoreSpec: false,
      matchedAlias: "结构形态规则",
      confidence: 58
    };
  }

  return null;
}

function matchStructuralShape(compact: string): string {
  const hasStructuralMaterial = /铝|铁|钢|不锈钢|锌合金|合金|金属|塑料|塑胶|pc|abs/.test(compact);
  if (!hasStructuralMaterial && !/支架|固定片|固定板|安装板|底座|底盘|外壳|壳体|面罩|边框|灯头|堵头/.test(compact)) {
    return "";
  }

  if (/杆|管|立柱|横梁|连接杆|支撑杆/.test(compact)) return "杆/管结构件";
  if (/框|边框|灯头框|铝框/.test(compact)) return "框架结构件";
  if (/壳|外壳|壳体|灯体|塑壳/.test(compact)) return "壳体结构件";
  if (/座|底座|底盘|安装盘/.test(compact)) return "底座/底盘结构件";
  if (/支架|固定片|固定板|安装板|挂板|背板|连接片/.test(compact)) return "支架/固定件";
  if (/盖|堵头|端盖|塞头|面罩|装饰圈/.test(compact)) return "盖/端部结构件";
  return "";
}
