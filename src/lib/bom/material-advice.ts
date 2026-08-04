export type MaterialNegotiationAdvice = {
  factors: string;
  verify: string;
  direction: string;
};

type AdviceRule = {
  pattern: RegExp;
  advice: MaterialNegotiationAdvice;
};

const RULES: AdviceRule[] = [
  {
    pattern: /电机|马达|motor/i,
    advice: {
      factors: "功率、铜线用量、硅钢片、轴承、尺寸与认证等级",
      verify: "核对电机型号、额定功率、重量、绕组方案和认证是否一致",
      direction: "统一电机平台和性能边界，按年度用量重新询价"
    }
  },
  {
    pattern: /驱动|控制器|遥控|接收器|电源|pcb|pcba|芯片|天线/i,
    advice: {
      factors: "功率、效率、控制协议、芯片方案、认证和质保要求",
      verify: "核对型号、功率、协议、关键器件品牌、认证及是否含软件费用",
      direction: "优先统一控制平台和关键器件档位，再比较批量阶梯价"
    }
  },
  {
    pattern: /led|灯珠|光源|铝基板|扩散|凌晶|棱晶|透镜|贴片/i,
    advice: {
      factors: "品牌与分档、灯珠数量、光效、色温显指、板材厚度和光学材料",
      verify: "核对品牌料号、数量、光通量、色温显指、板厚及透光参数",
      direction: "先统一光学和寿命指标，再比较替代料与贴片加工费"
    }
  },
  {
    pattern: /彩箱|彩盒|纸箱|外箱|泡棉|泡沫|珍珠棉|包装袋|胶袋|说明书|标签|贴纸/i,
    advice: {
      factors: "展开尺寸、材质克重、层数、印刷颜色、内衬结构和起订量",
      verify: "核对尺寸、纸质或密度、印刷工艺、装箱方式、数量和 MOQ",
      direction: "优化包装尺寸并推进通用化，拆分材料费、印刷费和加工费询价"
    }
  },
  {
    pattern: /线|端子|插座|插头|连接器|线夹|cable|wire/i,
    advice: {
      factors: "线径、长度、铜材、端子品牌、连接器规格和认证",
      verify: "核对 AWG、长度、铜材、端子或连接器型号及每套数量",
      direction: "统一线束长度和端子平台，按整套线组比较价格"
    }
  },
  {
    pattern: /螺丝|螺钉|螺母|垫片|扳手|五金|配件包/i,
    advice: {
      factors: "材质等级、尺寸、表面处理、数量和分包方式",
      verify: "核对材质、规格、镀层、每套数量及是否包含包装或组装",
      direction: "统一标准件规格并合并采购，减少非标和小批次费用"
    }
  },
  {
    pattern: /喷涂|烤漆|喷粉|电镀|氧化|表面处理/i,
    advice: {
      factors: "处理面积、工艺、颜色、膜厚、遮蔽要求和良率",
      verify: "核对处理面积、工艺层级、膜厚、颜色标准及良率假设",
      direction: "统一颜色和工艺标准，按面积与良率拆分报价"
    }
  },
  {
    pattern: /叶片|扇叶|风叶/i,
    advice: {
      factors: "材质、尺寸、数量、平衡要求、表面工艺和配重",
      verify: "核对材质、尺寸、单套数量、动平衡标准和表面处理",
      direction: "统一叶片平台与外观标准，单列平衡和加工费用"
    }
  },
  {
    pattern: /铝|铁|钢|框|杆|管|壳|底座|底盘|支架|固定|灯盘|吊钟|吊杆/i,
    advice: {
      factors: "材质牌号、净重、厚度、尺寸、加工工序、表面处理和良率",
      verify: "核对图纸版本、材质、单件净重、厚度、加工工序及表面要求",
      direction: "优先从减重、共用件、加工工序和良率假设中寻找空间"
    }
  }
];

const DEFAULT_ADVICE: MaterialNegotiationAdvice = {
  factors: "规格、数量、单位、品牌、工艺、起订量和是否含附加费用",
  verify: "核对双方规格、单位、每套用量、品牌档位和报价包含范围",
  direction: "要求供应商拆分主要成本构成，并在同一口径下重新报价"
};

export function getMaterialNegotiationAdvice(materialName: string, category = ""): MaterialNegotiationAdvice {
  const value = `${category} ${materialName}`;
  return RULES.find((rule) => rule.pattern.test(value))?.advice ?? DEFAULT_ADVICE;
}
