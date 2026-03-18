/**
 * Medical term annotation utility.
 *
 * Supports bidirectional highlighting:
 *   - English medical terms  → highlighted with Chinese gloss  e.g. tachycardia (心动过速)
 *   - Chinese medical terms  → highlighted with English gloss  e.g. 心动过速 (tachycardia)
 *
 * Mixed-language sentences (common in bilingual medical meetings) are handled
 * in a single pass: ASCII word tokens are looked up in the English→Chinese map;
 * CJK runs are scanned with a greedy longest-match against the Chinese→English
 * reverse map.
 *
 * To extend coverage, add entries to MEDICAL_TERMS below.
 */

// ---------------------------------------------------------------------------
// English → Chinese map (~300 entries)
// ---------------------------------------------------------------------------

const MEDICAL_TERMS = new Map<string, string>([
  // ── Anatomy ──────────────────────────────────────────────────────────────
  ['abdomen', '腹部'],
  ['abdominal', '腹部'],
  ['aorta', '主动脉'],
  ['aortic', '主动脉'],
  ['artery', '动脉'],
  ['arteries', '动脉'],
  ['arterial', '动脉'],
  ['atrium', '心房'],
  ['atrial', '心房'],
  ['bladder', '膀胱'],
  ['bronchus', '支气管'],
  ['bronchi', '支气管'],
  ['bronchial', '支气管'],
  ['capillary', '毛细血管'],
  ['capillaries', '毛细血管'],
  ['cartilage', '软骨'],
  ['cerebral', '大脑'],
  ['cerebrum', '大脑'],
  ['cervical', '颈椎/宫颈'],
  ['cochlea', '耳蜗'],
  ['colon', '结肠'],
  ['colonic', '结肠'],
  ['cornea', '角膜'],
  ['corneal', '角膜'],
  ['cortex', '皮质'],
  ['cortical', '皮质'],
  ['cranial', '颅骨'],
  ['cranium', '颅骨'],
  ['diaphragm', '膈肌'],
  ['duodenum', '十二指肠'],
  ['duodenal', '十二指肠'],
  ['esophagus', '食道'],
  ['esophageal', '食道'],
  ['femur', '股骨'],
  ['femoral', '股骨'],
  ['fibula', '腓骨'],
  ['fibular', '腓骨'],
  ['gallbladder', '胆囊'],
  ['hepatic', '肝脏'],
  ['humerus', '肱骨'],
  ['humeral', '肱骨'],
  ['ileum', '回肠'],
  ['ileal', '回肠'],
  ['jejunum', '空肠'],
  ['jejunal', '空肠'],
  ['kidney', '肾脏'],
  ['larynx', '喉'],
  ['laryngeal', '喉'],
  ['ligament', '韧带'],
  ['lumbar', '腰椎'],
  ['lymph', '淋巴'],
  ['lymphatic', '淋巴'],
  ['mandible', '下颌骨'],
  ['mandibular', '下颌骨'],
  ['maxilla', '上颌骨'],
  ['maxillary', '上颌骨'],
  ['medulla', '髓质'],
  ['meninges', '脑膜'],
  ['meningeal', '脑膜'],
  ['metacarpal', '掌骨'],
  ['mitral', '二尖瓣'],
  ['myocardium', '心肌'],
  ['myocardial', '心肌'],
  ['nephron', '肾单位'],
  ['neural', '神经'],
  ['neuron', '神经元'],
  ['neuronal', '神经元'],
  ['occipital', '枕骨'],
  ['optic', '视神经'],
  ['ovary', '卵巢'],
  ['ovarian', '卵巢'],
  ['pancreas', '胰腺'],
  ['pancreatic', '胰腺'],
  ['patella', '髌骨'],
  ['patellar', '髌骨'],
  ['pericardium', '心包'],
  ['pericardial', '心包'],
  ['peritoneum', '腹膜'],
  ['peritoneal', '腹膜'],
  ['pharynx', '咽喉'],
  ['pharyngeal', '咽喉'],
  ['pituitary', '垂体'],
  ['placenta', '胎盘'],
  ['placental', '胎盘'],
  ['pleura', '胸膜'],
  ['pleural', '胸膜'],
  ['prostate', '前列腺'],
  ['prostatic', '前列腺'],
  ['pulmonary', '肺部'],
  ['radius', '桡骨'],
  ['radial', '桡骨'],
  ['renal', '肾脏'],
  ['retina', '视网膜'],
  ['retinal', '视网膜'],
  ['sacrum', '骶骨'],
  ['sacral', '骶骨'],
  ['scapula', '肩胛骨'],
  ['scapular', '肩胛骨'],
  ['sclera', '巩膜'],
  ['scleral', '巩膜'],
  ['spinal', '脊柱'],
  ['spine', '脊柱'],
  ['spleen', '脾脏'],
  ['splenic', '脾脏'],
  ['sternum', '胸骨'],
  ['sternal', '胸骨'],
  ['synovial', '滑膜'],
  ['temporal', '颞骨'],
  ['tendon', '肌腱'],
  ['thalamus', '丘脑'],
  ['thalamic', '丘脑'],
  ['thoracic', '胸腔'],
  ['thorax', '胸腔'],
  ['thyroid', '甲状腺'],
  ['tibia', '胫骨'],
  ['tibial', '胫骨'],
  ['trachea', '气管'],
  ['tracheal', '气管'],
  ['ulna', '尺骨'],
  ['ulnar', '尺骨'],
  ['urethra', '尿道'],
  ['urethral', '尿道'],
  ['uterus', '子宫'],
  ['uterine', '子宫'],
  ['ventricle', '心室'],
  ['ventricular', '心室'],
  ['vertebra', '椎骨'],
  ['vertebral', '椎骨'],
  ['vestibule', '前庭'],
  ['vein', '静脉'],
  ['veins', '静脉'],
  ['venous', '静脉'],

  // ── Symptoms & signs ─────────────────────────────────────────────────────
  ['tachycardia', '心动过速'],
  ['bradycardia', '心动过缓'],
  ['hypertension', '高血压'],
  ['hypotension', '低血压'],
  ['dyspnea', '呼吸困难'],
  ['tachypnea', '呼吸急促'],
  ['bradypnea', '呼吸缓慢'],
  ['edema', '水肿'],
  ['cyanosis', '发绀'],
  ['pallor', '苍白'],
  ['jaundice', '黄疸'],
  ['nausea', '恶心'],
  ['hematemesis', '呕血'],
  ['hematuria', '血尿'],
  ['dysphagia', '吞咽困难'],
  ['dysarthria', '构音障碍'],
  ['ataxia', '共济失调'],
  ['syncope', '晕厥'],
  ['vertigo', '眩晕'],
  ['tremor', '震颤'],
  ['seizure', '癫痫发作'],
  ['convulsion', '抽搐'],
  ['paralysis', '瘫痪'],
  ['paresis', '轻瘫'],
  ['aphasia', '失语症'],
  ['diplopia', '复视'],
  ['tinnitus', '耳鸣'],
  ['pruritus', '瘙痒'],
  ['diaphoresis', '多汗'],
  ['palpitation', '心悸'],
  ['palpitations', '心悸'],
  ['anorexia', '食欲不振'],
  ['malaise', '不适'],
  ['lethargy', '嗜睡'],
  ['fever', '发热'],
  ['hypothermia', '体温过低'],
  ['hyperthermia', '体温过高'],
  ['diarrhea', '腹泻'],
  ['constipation', '便秘'],
  ['vomiting', '呕吐'],
  ['hemoptysis', '咯血'],
  ['epistaxis', '鼻出血'],
  ['melena', '黑便'],
  ['oliguria', '少尿'],
  ['polyuria', '多尿'],
  ['dysuria', '排尿困难'],
  ['hematochezia', '便血'],
  ['dyspepsia', '消化不良'],
  ['flatulence', '胀气'],
  ['bloating', '腹胀'],
  ['regurgitation', '反流'],
  ['palpable', '可触及'],
  ['auscultation', '听诊'],
  ['percussion', '叩诊'],
  ['crepitus', '捻发音'],
  ['ecchymosis', '瘀斑'],
  ['petechiae', '瘀点'],
  ['purpura', '紫癜'],
  ['erythema', '红斑'],
  ['urticaria', '荨麻疹'],
  ['papule', '丘疹'],
  ['macule', '斑疹'],
  ['vesicle', '水疱'],
  ['pustule', '脓疱'],
  ['nodule', '结节'],
  ['ulcer', '溃疡'],
  ['fissure', '裂隙'],
  ['abscess', '脓肿'],

  // ── Conditions & diagnoses ───────────────────────────────────────────────
  ['diabetes', '糖尿病'],
  ['diabetic', '糖尿病'],
  ['pneumonia', '肺炎'],
  ['bronchitis', '支气管炎'],
  ['asthma', '哮喘'],
  ['asthmatic', '哮喘'],
  ['copd', '慢阻肺'],
  ['angina', '心绞痛'],
  ['arrhythmia', '心律失常'],
  ['anemia', '贫血'],
  ['anaemia', '贫血'],
  ['leukemia', '白血病'],
  ['leukaemia', '白血病'],
  ['lymphoma', '淋巴瘤'],
  ['sepsis', '败血症'],
  ['septicemia', '败血症'],
  ['appendicitis', '阑尾炎'],
  ['pancreatitis', '胰腺炎'],
  ['hepatitis', '肝炎'],
  ['cirrhosis', '肝硬化'],
  ['nephritis', '肾炎'],
  ['glomerulonephritis', '肾小球肾炎'],
  ['arthritis', '关节炎'],
  ['osteoporosis', '骨质疏松'],
  ['osteoarthritis', '骨关节炎'],
  ['fracture', '骨折'],
  ['dislocation', '脱位'],
  ['concussion', '脑震荡'],
  ['dementia', '痴呆'],
  ['alzheimer', '阿尔茨海默病'],
  ['parkinson', '帕金森病'],
  ['epilepsy', '癫痫'],
  ['epileptic', '癫痫'],
  ['migraine', '偏头痛'],
  ['schizophrenia', '精神分裂症'],
  ['bipolar', '双相情感障碍'],
  ['insomnia', '失眠'],
  ['hypothyroidism', '甲状腺功能减退'],
  ['hyperthyroidism', '甲状腺功能亢进'],
  ['fibrillation', '颤动'],
  ['infarction', '梗死'],
  ['hypertrophy', '肥厚'],
  ['stenosis', '狭窄'],
  ['thrombosis', '血栓'],
  ['thrombotic', '血栓'],
  ['embolism', '栓塞'],
  ['embolus', '栓塞'],
  ['hemorrhage', '出血'],
  ['haemorrhage', '出血'],
  ['ischemia', '缺血'],
  ['ischaemia', '缺血'],
  ['ischemic', '缺血'],
  ['necrosis', '坏死'],
  ['carcinoma', '癌'],
  ['sarcoma', '肉瘤'],
  ['adenoma', '腺瘤'],
  ['melanoma', '黑色素瘤'],
  ['glioma', '胶质瘤'],
  ['mesothelioma', '间皮瘤'],
  ['metastasis', '转移'],
  ['metastatic', '转移'],
  ['benign', '良性'],
  ['malignant', '恶性'],
  ['autoimmune', '自身免疫'],
  ['immunodeficiency', '免疫缺陷'],
  ['allergy', '过敏'],
  ['allergic', '过敏'],
  ['anaphylaxis', '过敏反应'],
  ['atherosclerosis', '动脉粥样硬化'],
  ['arteriosclerosis', '动脉硬化'],
  ['pericarditis', '心包炎'],
  ['myocarditis', '心肌炎'],
  ['endocarditis', '心内膜炎'],
  ['pleuritis', '胸膜炎'],
  ['pleurisy', '胸膜炎'],
  ['peritonitis', '腹膜炎'],
  ['cholecystitis', '胆囊炎'],
  ['urolithiasis', '尿石症'],
  ['nephrolithiasis', '肾结石'],
  ['cholelithiasis', '胆石症'],
  ['diverticulitis', '憩室炎'],
  ['colitis', '结肠炎'],
  ['gastritis', '胃炎'],
  ['esophagitis', '食道炎'],
  ['dermatitis', '皮炎'],
  ['psoriasis', '银屑病'],
  ['eczema', '湿疹'],
  ['celiac', '乳糜泻'],
  ['crohn', '克罗恩病'],
  ['lupus', '红斑狼疮'],
  ['fibromyalgia', '纤维肌痛'],
  ['scoliosis', '脊柱侧弯'],
  ['kyphosis', '脊柱后凸'],
  ['lordosis', '脊柱前凸'],
  ['spondylosis', '脊椎病'],
  ['herniation', '疝'],
  ['prolapse', '脱垂'],
  ['ptosis', '上睑下垂'],
  ['glaucoma', '青光眼'],
  ['cataract', '白内障'],
  ['macular', '黄斑'],
  ['retinopathy', '视网膜病变'],
  ['neuropathy', '神经病变'],
  ['polyneuropathy', '多发性神经病变'],
  ['carpal', '腕管'],
  ['sciatica', '坐骨神经痛'],
  ['lumbago', '腰痛'],

  // ── Medications ──────────────────────────────────────────────────────────
  ['aspirin', '阿司匹林'],
  ['ibuprofen', '布洛芬'],
  ['acetaminophen', '对乙酰氨基酚'],
  ['paracetamol', '对乙酰氨基酚'],
  ['naproxen', '萘普生'],
  ['metformin', '二甲双胍'],
  ['insulin', '胰岛素'],
  ['lisinopril', '赖诺普利'],
  ['atorvastatin', '阿托伐他汀'],
  ['simvastatin', '辛伐他汀'],
  ['rosuvastatin', '瑞舒伐他汀'],
  ['metoprolol', '美托洛尔'],
  ['carvedilol', '卡维地洛'],
  ['bisoprolol', '比索洛尔'],
  ['amlodipine', '氨氯地平'],
  ['nifedipine', '硝苯地平'],
  ['verapamil', '维拉帕米'],
  ['diltiazem', '地尔硫卓'],
  ['omeprazole', '奥美拉唑'],
  ['pantoprazole', '泮托拉唑'],
  ['esomeprazole', '埃索美拉唑'],
  ['ranitidine', '雷尼替丁'],
  ['famotidine', '法莫替丁'],
  ['warfarin', '华法林'],
  ['heparin', '肝素'],
  ['enoxaparin', '依诺肝素'],
  ['clopidogrel', '氯吡格雷'],
  ['ticagrelor', '替格瑞洛'],
  ['apixaban', '阿哌沙班'],
  ['rivaroxaban', '利伐沙班'],
  ['amoxicillin', '阿莫西林'],
  ['azithromycin', '阿奇霉素'],
  ['ciprofloxacin', '环丙沙星'],
  ['doxycycline', '多西环素'],
  ['clindamycin', '克林霉素'],
  ['vancomycin', '万古霉素'],
  ['metronidazole', '甲硝唑'],
  ['fluconazole', '氟康唑'],
  ['prednisone', '泼尼松'],
  ['prednisolone', '泼尼松龙'],
  ['dexamethasone', '地塞米松'],
  ['hydrocortisone', '氢化可的松'],
  ['albuterol', '沙丁胺醇'],
  ['salbutamol', '沙丁胺醇'],
  ['salmeterol', '沙美特罗'],
  ['budesonide', '布地奈德'],
  ['fluticasone', '氟替卡松'],
  ['morphine', '吗啡'],
  ['oxycodone', '羟考酮'],
  ['hydrocodone', '氢可酮'],
  ['codeine', '可待因'],
  ['tramadol', '曲马多'],
  ['fentanyl', '芬太尼'],
  ['buprenorphine', '丁丙诺啡'],
  ['naloxone', '纳洛酮'],
  ['furosemide', '呋塞米'],
  ['spironolactone', '螺内酯'],
  ['hydrochlorothiazide', '氢氯噻嗪'],
  ['levothyroxine', '左甲状腺素'],
  ['sertraline', '舍曲林'],
  ['fluoxetine', '氟西汀'],
  ['paroxetine', '帕罗西汀'],
  ['escitalopram', '艾司西酞普兰'],
  ['citalopram', '西酞普兰'],
  ['venlafaxine', '文拉法辛'],
  ['duloxetine', '度洛西汀'],
  ['alprazolam', '阿普唑仑'],
  ['lorazepam', '劳拉西泮'],
  ['diazepam', '地西泮'],
  ['clonazepam', '氯硝西泮'],
  ['zolpidem', '唑吡坦'],
  ['gabapentin', '加巴喷丁'],
  ['pregabalin', '普瑞巴林'],
  ['carbamazepine', '卡马西平'],
  ['phenytoin', '苯妥英'],
  ['valproate', '丙戊酸'],
  ['lamotrigine', '拉莫三嗪'],
  ['levetiracetam', '左乙拉西坦'],
  ['methotrexate', '甲氨蝶呤'],
  ['cyclophosphamide', '环磷酰胺'],
  ['tamoxifen', '他莫昔芬'],
  ['letrozole', '来曲唑'],
  ['losartan', '氯沙坦'],
  ['valsartan', '缬沙坦'],
  ['ramipril', '雷米普利'],
  ['enalapril', '依那普利'],
  ['sildenafil', '西地那非'],
  ['tadalafil', '他达拉非'],
  ['finasteride', '非那雄胺'],
  ['allopurinol', '别嘌醇'],
  ['colchicine', '秋水仙碱'],
  ['hydroxychloroquine', '羟氯喹'],
  ['adalimumab', '阿达木单抗'],

  // ── Procedures & interventions ───────────────────────────────────────────
  ['biopsy', '活检'],
  ['catheterization', '导管插入'],
  ['catheterisation', '导管插入'],
  ['colonoscopy', '结肠镜'],
  ['endoscopy', '内镜'],
  ['bronchoscopy', '支气管镜'],
  ['cystoscopy', '膀胱镜'],
  ['intubation', '气管插管'],
  ['extubation', '拔管'],
  ['ventilation', '机械通气'],
  ['dialysis', '透析'],
  ['hemodialysis', '血液透析'],
  ['haemodialysis', '血液透析'],
  ['transplant', '移植'],
  ['resection', '切除'],
  ['excision', '切除术'],
  ['debridement', '清创'],
  ['amputation', '截肢'],
  ['angioplasty', '血管成形术'],
  ['bypass', '旁路手术'],
  ['stenting', '支架置入'],
  ['laparoscopy', '腹腔镜'],
  ['laparotomy', '开腹手术'],
  ['arthroscopy', '关节镜'],
  ['craniotomy', '开颅手术'],
  ['tracheotomy', '气管切开术'],
  ['tracheostomy', '气管造口术'],
  ['thoracentesis', '胸腔穿刺'],
  ['paracentesis', '腹腔穿刺'],
  ['thoracotomy', '开胸手术'],
  ['venipuncture', '静脉穿刺'],
  ['cannulation', '置管'],
  ['defibrillation', '除颤'],
  ['cardioversion', '电复律'],
  ['ablation', '消融'],
  ['pacemaker', '起搏器'],
  ['electrocautery', '电凝'],
  ['ligation', '结扎'],
  ['anastomosis', '吻合术'],
  ['endarterectomy', '内膜切除术'],
  ['valvuloplasty', '瓣膜成形术'],
  ['mastectomy', '乳房切除术'],
  ['hysterectomy', '子宫切除术'],
  ['appendectomy', '阑尾切除术'],
  ['cholecystectomy', '胆囊切除术'],
  ['nephrectomy', '肾切除术'],
  ['prostatectomy', '前列腺切除术'],
  ['thyroidectomy', '甲状腺切除术'],
  ['lobectomy', '肺叶切除术'],
  ['pneumonectomy', '肺切除术'],
  ['splenectomy', '脾切除术'],
  ['colectomy', '结肠切除术'],
  ['gastrectomy', '胃切除术'],

  // ── Lab & diagnostics ────────────────────────────────────────────────────
  ['hemoglobin', '血红蛋白'],
  ['haemoglobin', '血红蛋白'],
  ['hematocrit', '血细胞比容'],
  ['haematocrit', '血细胞比容'],
  ['creatinine', '肌酐'],
  ['troponin', '肌钙蛋白'],
  ['glucose', '血糖'],
  ['cholesterol', '胆固醇'],
  ['triglyceride', '甘油三酯'],
  ['triglycerides', '甘油三酯'],
  ['electrolyte', '电解质'],
  ['electrolytes', '电解质'],
  ['albumin', '白蛋白'],
  ['bilirubin', '胆红素'],
  ['urinalysis', '尿常规'],
  ['cytology', '细胞学'],
  ['pathology', '病理学'],
  ['radiology', '放射学'],
  ['echocardiogram', '超声心动图'],
  ['spirometry', '肺功能检测'],
  ['oximetry', '血氧测定'],
  ['angiogram', '血管造影'],
  ['mammogram', '乳腺钼靶'],
  ['electrocardiogram', '心电图'],
  ['electroencephalogram', '脑电图'],
  ['eeg', '脑电图'],
  ['ecg', '心电图'],
  ['ekg', '心电图'],
  ['mri', '磁共振成像'],
  ['ct', 'CT扫描'],
  ['pet', '正电子发射断层'],
  ['ultrasound', '超声波'],
  ['sonogram', '声像图'],
  ['platelet', '血小板'],
  ['leukocyte', '白细胞'],
  ['erythrocyte', '红细胞'],
  ['neutrophil', '中性粒细胞'],
  ['lymphocyte', '淋巴细胞'],
  ['monocyte', '单核细胞'],
  ['eosinophil', '嗜酸性粒细胞'],
  ['basophil', '嗜碱性粒细胞'],
  ['prothrombin', '凝血酶原'],
  ['fibrinogen', '纤维蛋白原'],
  ['coagulation', '凝血'],
  ['inr', '国际标准化比值'],
  ['ptt', '凝血酶原时间'],
  ['aptt', '活化部分凝血活酶时间'],
  ['bun', '血尿素氮'],
  ['ast', '天冬氨酸转氨酶'],
  ['alt', '丙氨酸转氨酶'],
  ['alkaline', '碱性磷酸酶'],
  ['phosphatase', '磷酸酶'],
  ['ferritin', '铁蛋白'],
  ['transferrin', '转铁蛋白'],
  ['hba1c', '糖化血红蛋白'],
  ['psa', '前列腺特异性抗原'],
  ['serology', '血清学'],
  ['titer', '滴度'],
  ['immunoassay', '免疫测定'],
  ['pcr', '聚合酶链反应'],
  ['cytokine', '细胞因子'],
  ['antigen', '抗原'],
  ['antibody', '抗体'],
  ['immunoglobulin', '免疫球蛋白'],

  // ── Specialties ──────────────────────────────────────────────────────────
  ['anesthesia', '麻醉'],
  ['anesthesiology', '麻醉学'],
  ['cardiology', '心脏病学'],
  ['cardiologist', '心脏科医生'],
  ['neurology', '神经科'],
  ['neurologist', '神经科医生'],
  ['oncology', '肿瘤科'],
  ['oncologist', '肿瘤科医生'],
  ['hematology', '血液科'],
  ['hematologist', '血液科医生'],
  ['nephrology', '肾脏科'],
  ['nephrologist', '肾脏科医生'],
  ['gastroenterology', '消化科'],
  ['gastroenterologist', '消化科医生'],
  ['pulmonology', '肺科'],
  ['pulmonologist', '肺科医生'],
  ['endocrinology', '内分泌科'],
  ['endocrinologist', '内分泌科医生'],
  ['rheumatology', '风湿科'],
  ['rheumatologist', '风湿科医生'],
  ['orthopedic', '骨科'],
  ['orthopedics', '骨科'],
  ['psychiatry', '精神科'],
  ['psychiatrist', '精神科医生'],
  ['dermatology', '皮肤科'],
  ['dermatologist', '皮肤科医生'],
  ['ophthalmology', '眼科'],
  ['ophthalmologist', '眼科医生'],
  ['otolaryngology', '耳鼻喉科'],
  ['otolaryngologist', '耳鼻喉科医生'],
  ['urology', '泌尿科'],
  ['urologist', '泌尿科医生'],
  ['gynecology', '妇科'],
  ['gynaecology', '妇科'],
  ['gynecologist', '妇科医生'],
  ['obstetrics', '产科'],
  ['obstetrician', '产科医生'],
  ['pediatrics', '儿科'],
  ['paediatrics', '儿科'],
  ['pediatrician', '儿科医生'],
  ['radiologist', '放射科医生'],
  ['pathologist', '病理科医生'],
]);

// ---------------------------------------------------------------------------
// Chinese → English reverse map (built automatically from MEDICAL_TERMS)
// First occurrence wins when multiple English terms share the same Chinese.
// ---------------------------------------------------------------------------

const ZH_TO_EN = new Map<string, string>();
for (const [en, zh] of MEDICAL_TERMS) {
  if (!ZH_TO_EN.has(zh)) {
    ZH_TO_EN.set(zh, en);
  }
}

// Sorted descending by length so longest-match wins in the CJK scan.
const ZH_ENTRIES = [...ZH_TO_EN.entries()].sort((a, b) => b[0].length - a[0].length);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextSegment {
  text: string;
  isMedical: boolean;
  /**
   * Translation gloss to display in parentheses:
   *   - Chinese string when the term was matched as an English word
   *   - English string when the term was matched as a Chinese phrase
   */
  gloss?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true for Basic CJK and CJK Extension A codepoints. */
function isCJK(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  return (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf);
}

function appendNonMedical(segs: TextSegment[], text: string): void {
  const last = segs[segs.length - 1];
  if (last && !last.isMedical) {
    last.text += text;
  } else {
    segs.push({ text, isMedical: false });
  }
}

// ---------------------------------------------------------------------------
// Core annotator
// ---------------------------------------------------------------------------

/**
 * Annotates both English and Chinese medical terms in a single pass:
 *
 * • ASCII word tokens   → looked up in the English→Chinese map
 * • CJK runs            → greedy longest-match against the Chinese→English map
 * • Everything else     → merged into adjacent non-medical segments
 *
 * Returns an array of `TextSegment` objects.  Medical segments carry a `gloss`
 * string (Chinese or English) for parenthetical display.
 */
export function annotateMedicalTerms(text: string): TextSegment[] {
  if (!text) return [{ text: '', isMedical: false }];

  const segs: TextSegment[] = [];
  let i = 0;

  while (i < text.length) {
    // charAt always returns '' (not undefined) for out-of-range indices.
    const char = text.charAt(i);

    if (/\w/.test(char)) {
      // ── English/ASCII word ─────────────────────────────────────────────
      let j = i + 1;
      while (j < text.length && /\w/.test(text.charAt(j))) j++;
      const word = text.slice(i, j);
      const zh = MEDICAL_TERMS.get(word.toLowerCase());
      if (zh) {
        segs.push({ text: word, isMedical: true, gloss: zh });
      } else {
        appendNonMedical(segs, word);
      }
      i = j;
    } else if (isCJK(char)) {
      // ── Chinese phrase — greedy longest match ──────────────────────────
      let matched = false;
      for (const [zh, en] of ZH_ENTRIES) {
        if (text.startsWith(zh, i)) {
          segs.push({ text: zh, isMedical: true, gloss: en });
          i += zh.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        appendNonMedical(segs, char);
        i++;
      }
    } else {
      // ── Punctuation / whitespace / non-CJK ────────────────────────────
      appendNonMedical(segs, char);
      i++;
    }
  }

  return segs;
}
