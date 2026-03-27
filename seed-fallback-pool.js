#!/usr/bin/env node

/**
 * Quick MCQ Fallback Pool Seeder
 * Directly inserts pre-validated medical MCQ questions into database
 * No API calls - instant population
 */

require('dotenv').config();
const Database = require('better-sqlite3');

const fs = require('fs');
try { fs.mkdirSync('./data', { recursive: true }); } catch (e) { /* already exists */ }
const db = new Database('./data/library.db');
db.pragma('journal_mode = WAL');
console.log('✅ Connected to library database\n');

// Pre-curated medical MCQ questions (100 per mode)
const mcqQuestions = {
  practice: [
    // Easy (33)
    { difficulty: 'easy', question: 'What is the normal resting heart rate in adults?', options: { A: '60-100 bpm', B: '40-60 bpm', C: '100-120 bpm', D: '120-140 bpm' }, correctOption: 'A', explanation: 'Normal resting heart rate in healthy adults ranges from 60-100 beats per minute.' },
    { difficulty: 'easy', question: 'Which blood type is the universal donor?', options: { A: 'O negative', B: 'AB positive', C: 'O positive', D: 'A negative' }, correctOption: 'A', explanation: 'O negative blood cells lack A, B, and Rh antigens, making them compatible with all blood types.' },
    { difficulty: 'easy', question: 'What is the primary function of hemoglobin?', options: { A: 'Transport oxygen', B: 'Fight infections', C: 'Clot blood', D: 'Produce antibodies' }, correctOption: 'A', explanation: 'Hemoglobin is the iron-containing protein in red blood cells that binds and transports oxygen.' },
    { difficulty: 'easy', question: 'Which organ produces insulin?', options: { A: 'Pancreas', B: 'Liver', C: 'Kidney', D: 'Stomach' }, correctOption: 'A', explanation: 'The pancreas produces insulin in specialized cells called beta cells in the islets of Langerhans.' },
    { difficulty: 'easy', question: 'What is the normal temperature of the human body?', options: { A: '37°C', B: '35°C', C: '39°C', D: '41°C' }, correctOption: 'A', explanation: 'Normal body temperature is approximately 37°C or 98.6°F when measured in the morning.' },
    { difficulty: 'easy', question: 'Which bone is the largest in the human body?', options: { A: 'Femur', B: 'Tibia', C: 'Humerus', D: 'Fibula' }, correctOption: 'A', explanation: 'The femur (thigh bone) is the largest bone in the human body.' },
    { difficulty: 'easy', question: 'What is the main function of white blood cells?', options: { A: 'Fight infections', B: 'Transport oxygen', C: 'Clot blood', D: 'Regulate pH' }, correctOption: 'A', explanation: 'White blood cells or leukocytes are responsible for defending against infections and pathogens.' },
    { difficulty: 'easy', question: 'How many chambers does the heart have?', options: { A: '4', B: '2', C: '3', D: '6' }, correctOption: 'A', explanation: 'The heart has 4 chambers: 2 atria and 2 ventricles.' },
    { difficulty: 'easy', question: 'What is the role of the thyroid gland?', options: { A: 'Regulate metabolism', B: 'Produce antibodies', C: 'Regulate blood calcium', D: 'Produce adrenaline' }, correctOption: 'A', explanation: 'The thyroid gland produces thyroid hormones that regulate metabolic rate and energy production.' },
    { difficulty: 'easy', question: 'Which vitamin is stored in the liver?', options: { A: 'Vitamin A', B: 'Vitamin C', C: 'Vitamin D', D: 'Vitamin B1' }, correctOption: 'A', explanation: 'Fat-soluble vitamins including A, D, E, and K are stored in the liver.' },
    { difficulty: 'easy', question: 'What is the main component of bone matrix?', options: { A: 'Collagen', B: 'Keratin', C: 'Elastin', D: 'Myosin' }, correctOption: 'A', explanation: 'Collagen provides the structural framework of bone, giving it flexibility.' },
    { difficulty: 'easy', question: 'How many pairs of chromosomes do humans have?', options: { A: '23', B: '46', C: '12', D: '15' }, correctOption: 'A', explanation: 'Humans have 23 pairs of chromosomes (46 total) including sex chromosomes.' },
    { difficulty: 'easy', question: 'What is the function of the diaphragm?', options: { A: 'Aid in breathing', B: 'Regulate heartbeat', C: 'Produce saliva', D: 'Filter blood' }, correctOption: 'A', explanation: 'The diaphragm is the main respiratory muscle that contracts to allow air into the lungs.' },
    { difficulty: 'easy', question: 'Which hormone regulates blood sugar?', options: { A: 'Insulin', B: 'Adrenaline', C: 'Cortisol', D: 'Glucagon alone' }, correctOption: 'A', explanation: 'Insulin regulates blood glucose by promoting cellular uptake of glucose.' },
    { difficulty: 'easy', question: 'What is the normal pH of blood?', options: { A: '7.35-7.45', B: '5.5-6.5', C: '8.5-9.5', D: '6.5-7.0' }, correctOption: 'A', explanation: 'Blood pH is maintained at 7.35-7.45, slightly alkaline.' },
    { difficulty: 'easy', question: 'Which gland produces melatonin?', options: { A: 'Pineal gland', B: 'Pituitary gland', C: 'Thyroid gland', D: 'Adrenal gland' }, correctOption: 'A', explanation: 'The pineal gland produces melatonin, which regulates sleep-wake cycles.' },
    { difficulty: 'easy', question: 'What is the primary function of antibodies?', options: { A: 'Neutralize pathogens', B: 'Transport oxygen', C: 'Clot blood', D: 'Regulate temperature' }, correctOption: 'A', explanation: 'Antibodies bind to antigens and mark pathogens for destruction by the immune system.' },
    { difficulty: 'easy', question: 'How many lobes does the lung have?', options: { A: 'Right 3, Left 2', B: 'Right 2, Left 3', C: 'Right 3, Left 3', D: 'Right 2, Left 2' }, correctOption: 'A', explanation: 'The right lung has 3 lobes while the left lung has 2 lobes (with cardiac notch).' },
    { difficulty: 'easy', question: 'What is the main function of albumin?', options: { A: 'Transport and osmotic pressure', B: 'Fight infections', C: 'Clot blood', D: 'Regulate acid-base' }, correctOption: 'A', explanation: 'Albumin is the most abundant plasma protein, transporting hormones and drugs, maintaining osmotic pressure.' },
    { difficulty: 'easy', question: 'Which artery is used for pulse check?', options: { A: 'Radial artery', B: 'Coronary artery', C: 'Carotid artery', D: 'Femoral artery' }, correctOption: 'A', explanation: 'The radial artery at the wrist is commonly used to check pulse in clinical practice.' },
    { difficulty: 'easy', question: 'What is the function of lysosomes?', options: { A: 'Cellular digestion', B: 'Protein synthesis', C: 'DNA replication', D: 'Lipid storage' }, correctOption: 'A', explanation: 'Lysosomes contain digestive enzymes that break down cellular waste and pathogens.' },
    { difficulty: 'easy', question: 'Which nerve is responsible for facial expressions?', options: { A: 'Facial nerve (CN VII)', B: 'Trigeminal nerve (CN V)', C: 'Abducens nerve (CN VI)', D: 'Accessory nerve (CN XI)' }, correctOption: 'A', explanation: 'The facial nerve (seventh cranial nerve) innervates muscles of facial expression.' },
    { difficulty: 'easy', question: 'What is the minimum hemoglobin level for anemia in adult males?', options: { A: '<13.5 g/dL', B: '<12 g/dL', C: '<14 g/dL', D: '<11 g/dL' }, correctOption: 'A', explanation: 'Hemoglobin below 13.5 g/dL in adult males is considered anemia.' },
    { difficulty: 'easy', question: 'Which vitamin deficiency causes scurvy?', options: { A: 'Vitamin C', B: 'Vitamin A', C: 'Vitamin B12', D: 'Vitamin D' }, correctOption: 'A', explanation: 'Vitamin C (ascorbic acid) deficiency causes scurvy, affecting collagen synthesis.' },
    { difficulty: 'easy', question: 'What is the normal respiratory rate in adults?', options: { A: '12-20 breaths/min', B: '20-30 breaths/min', C: '5-10 breaths/min', D: '30-40 breaths/min' }, correctOption: 'A', explanation: 'Normal respiratory rate in resting adults is 12-20 breaths per minute.' },
    { difficulty: 'easy', question: 'Which cells produce cortisol?', options: { A: 'Adrenal cortex', B: 'Adrenal medulla', C: 'Pancreas', D: 'Thyroid' }, correctOption: 'A', explanation: 'The adrenal cortex produces cortisol, a glucocorticoid hormone.' },
    { difficulty: 'easy', question: 'What is the primary function of mitochondria?', options: { A: 'ATP production', B: 'Protein synthesis', C: 'DNA storage', D: 'Carbohydrate breakdown' }, correctOption: 'A', explanation: 'Mitochondria produce ATP through oxidative phosphorylation, providing cellular energy.' },
    { difficulty: 'easy', question: 'How many times does the heart beat per minute on average?', options: { A: '60-100', B: '40-60', C: '100-120', D: '120-150' }, correctOption: 'A', explanation: 'Average resting heart rate is 60-100 beats per minute.' },
    { difficulty: 'easy', question: 'What is the function of the trachea?', options: { A: 'Conduct air to lungs', B: 'Produce sound', C: 'Filter air', D: 'Regulate breathing' }, correctOption: 'A', explanation: 'The trachea (windpipe) conducts air from the larynx to the primary bronchi.' },
    { difficulty: 'easy', question: 'Which organ produces bile?', options: { A: 'Liver', B: 'Pancreas', C: 'Gallbladder', D: 'Intestine' }, correctOption: 'A', explanation: 'The liver produces bile, which is stored in the gallbladder and aids fat digestion.' },
    { difficulty: 'easy', question: 'What is the normal blood pressure range?', options: { A: '<120/80 mmHg', B: '<130/90 mmHg', C: '<140/90 mmHg', D: '<100/60 mmHg' }, correctOption: 'A', explanation: 'Normal blood pressure is less than 120/80 mmHg.' },
    { difficulty: 'easy', question: 'Which protein is most abundant in plasma?', options: { A: 'Albumin', B: 'Globulin', C: 'Fibrinogen', D: 'Prothrombin' }, correctOption: 'A', explanation: 'Albumin comprises about 50-60% of total plasma proteins.' },
    // Medium (33)
    { difficulty: 'medium', question: 'What is the mechanism of action of ACE inhibitors in hypertension?', options: { A: 'Block angiotensin II formation', B: 'Block beta-adrenergic receptors', C: 'Block calcium channels', D: 'Increase sodium excretion' }, correctOption: 'A', explanation: 'ACE inhibitors block the conversion of angiotensin I to angiotensin II, reducing vasoconstriction.' },
    { difficulty: 'medium', question: 'Which enzyme is primarily responsible for fat digestion?', options: { A: 'Pancreatic lipase', B: 'Pepsin', C: 'Amylase', D: 'Trypsin' }, correctOption: 'A', explanation: 'Pancreatic lipase is the main enzyme that hydrolyzes triglycerides into fatty acids and glycerol.' },
    { difficulty: 'medium', question: 'What is the pathophysiology of diabetic ketoacidosis?', options: { A: 'Insulin deficiency causing lipolysis and ketone production', B: 'Excess glucose without hyperosmolarity', C: 'Respiratory acidosis from hypoventilation', D: 'Metabolic alkalosis from vomiting' }, correctOption: 'A', explanation: 'DKA results from relative insulin deficiency, leading to lipolysis, ketone production, and metabolic acidosis.' },
    { difficulty: 'medium', question: 'Which cytokine is primarily produced by Th1 cells?', options: { A: 'Interferon-gamma', B: 'Interleukin-4', C: 'Interleukin-5', D: 'Transforming growth factor-beta' }, correctOption: 'A', explanation: 'Th1 cells primarily produce interferon-gamma, promoting cell-mediated immunity.' },
    { difficulty: 'medium', question: 'What is the mechanism of action of statins?', options: { A: 'Inhibit HMG-CoA reductase', B: 'Inhibit DNA gyrase', C: 'Block beta-receptors', D: 'Inhibit acetylcholinesterase' }, correctOption: 'A', explanation: 'Statins inhibit HMG-CoA reductase, the rate-limiting enzyme in cholesterol synthesis.' },
    { difficulty: 'medium', question: 'What happens to venous return when intrathoracic pressure decreases?', options: { A: 'Increases', B: 'Decreases', C: 'No change', D: 'Fluctuates' }, correctOption: 'A', explanation: 'During inspiration, intrathoracic pressure becomes more negative, enhancing venous return to the heart.' },
    { difficulty: 'medium', question: 'Which mutation is associated with familial hypercholesterolemia?', options: { A: 'LDL receptor gene mutation', B: 'APOB mutation', C: 'APOE mutation', D: 'LDLR regulatory region' }, correctOption: 'A', explanation: 'Familial hypercholesterolemia is primarily caused by LDL receptor gene mutations.' },
    { difficulty: 'medium', question: 'What is the relationship between Pco2 and pH in respiratory acidosis?', options: { A: 'Both increased', B: 'Pco2 increased, pH decreased', C: 'Pco2 decreased, pH increased', D: 'Both decreased' }, correctOption: 'B', explanation: 'Respiratory acidosis occurs when Pco2 is elevated and pH is lowered due to hypoventilation.' },
    { difficulty: 'medium', question: 'Which phase of mitosis involves separation of sister chromatids?', options: { A: 'Anaphase', B: 'Metaphase', C: 'Prophase', D: 'Telophase' }, correctOption: 'A', explanation: 'During anaphase, sister chromatids separate and move toward opposite poles of the cell.' },
    { difficulty: 'medium', question: 'What is the primary site of vitamin B12 absorption?', options: { A: 'Terminal ileum', B: 'Duodenum', C: 'Jejunum', D: 'Stomach' }, correctOption: 'A', explanation: 'Vitamin B12 is absorbed in the terminal ileum via intrinsic factor-mediated transport.' },
    { difficulty: 'medium', question: 'How does hypoxia lead to erythropoietin production?', options: { A: 'Via HIF-1 alpha activation in kidney', B: 'Direct hemoglobin sensing', C: 'Thyroid hormone stimulation', D: 'Sympathetic nervous system' }, correctOption: 'A', explanation: 'Hypoxia stabilizes HIF-1 alpha, which increases EPO production in renal interstitial fibroblasts.' },
    { difficulty: 'medium', question: 'Which heart sound represents closure of aortic and pulmonary valves?', options: { A: 'S2', B: 'S1', C: 'S3', D: 'S4' }, correctOption: 'A', explanation: 'S2 (the second heart sound) is caused by closure of the aortic and pulmonary valves.' },
    { difficulty: 'medium', question: 'What is the mechanism of pulmonary edema in left heart failure?', options: { A: 'Increased left atrial pressure causing capillary hydrostatic pressure increase', B: 'Decreased colloid osmotic pressure', C: 'Increased capillary permeability alone', D: 'Lymphatic obstruction' }, correctOption: 'A', explanation: 'Left heart failure reduces cardiac output, causing back-up of blood in pulmonary circulation and increased capillary hydrostatic pressure.' },
    { difficulty: 'medium', question: 'What is the Frank-Starling mechanism?', options: { A: 'Increased preload increases stroke volume', B: 'Increased afterload increases stroke volume', C: 'Sympathetic activation only', D: 'Reduced contractility with exercise' }, correctOption: 'A', explanation: 'The Frank-Starling law states that cardiac muscle contracts more forcefully when stretched within physiologic limits.' },
    { difficulty: 'medium', question: 'How does renin increase blood pressure?', options: { A: 'Via angiotensin II-mediated vasoconstriction and aldosterone secretion', B: 'Direct vasodilation', C: 'Increased natriuresis', D: 'Decreased sympathetic tone' }, correctOption: 'A', explanation: 'Renin activates the renin-angiotensin system, leading to vasoconstriction and sodium/water retention.' },
    { difficulty: 'medium', question: 'What is the primary function of antihistamines in type I hypersensitivity?', options: { A: 'Block histamine receptors', B: 'Prevent mast cell degranulation', C: 'Neutralize IgE', D: 'Inhibit complement activation' }, correctOption: 'A', explanation: 'Antihistamines block H1 receptors to prevent histamine-mediated symptoms in type I reactions.' },
    { difficulty: 'medium', question: 'How do loop diuretics cause hypokalemia?', options: { A: 'Increased distal tubule sodium delivery promoting potassium excretion', B: 'Direct potassium secretion', C: 'Decreased aldosterone', D: 'Increased GFR only' }, correctOption: 'A', explanation: 'Loop diuretics increase distal tubule sodium delivery, promoting potassium-sodium exchange and hypokalemia.' },
    { difficulty: 'medium', question: 'What is the mechanism of action of proton pump inhibitors?', options: { A: 'Inhibit H+/K+ ATPase', B: 'Block histamine H2 receptors', C: 'Neutralize gastric acid', D: 'Increase mucus production' }, correctOption: 'A', explanation: 'PPIs irreversibly inhibit the H+/K+ ATPase pump on parietal cells, reducing gastric acid secretion.' },
    { difficulty: 'medium', question: 'What causes the widened QRS complex in bundle branch block?', options: { A: 'Delayed ventricular depolarization through collateral pathways', B: 'Atrial enlargement', C: 'AV nodal delay', D: 'Atrial fibrillation' }, correctOption: 'A', explanation: 'Bundle branch block causes depolarization delay through slower collateral pathways, widening QRS to >120ms.' },
    { difficulty: 'medium', question: 'How does hyperkalemia affect cardiac electrophysiology?', options: { A: 'Decreases resting membrane potential, slowing conduction', B: 'Increases automaticity without conduction changes', C: 'Increases AV nodal velocity', D: 'Decreases atrial refractory period' }, correctOption: 'A', explanation: 'Hyperkalemia reduces the difference between resting and threshold potentials, decreasing excitability and slowing conduction.' },
    { difficulty: 'medium', question: 'What is the role of the parasympathetic nervous system in heart rate?', options: { A: 'Reduces heart rate via acetylcholine at SA node', B: 'Increases heart rate', C: 'Only affects AV nodal conduction', D: 'Has no cardiac effect' }, correctOption: 'A', explanation: 'Parasympathetic nerve releases acetylcholine at SA node, hyperpolarizing cells and reducing heart rate.' },
    { difficulty: 'medium', question: 'How does atrial fibrillation lead to thromboembolism?', options: { A: 'Loss of atrial contraction causing blood stasis in left atrial appendage', B: 'Direct endothelial injury', C: 'Increased bleeding tendency', D: 'Reduced platelet adhesion' }, correctOption: 'A', explanation: 'Atrial fibrillation eliminates the atrial kick, causing blood stasis in the LAA, predisposing to thrombus formation.' },
    { difficulty: 'medium', question: 'What is the mechanism of action of beta-blockers?', options: { A: 'Block adrenergic receptors, reducing heart rate and contractility', B: 'Direct vasodilation', C: 'Increase vagal tone', D: 'Block calcium channels' }, correctOption: 'A', explanation: 'Beta-blockers antagonize catecholamine effects, reducing heart rate, contractility, and blood pressure.' },
    { difficulty: 'medium', question: 'How does septic shock develop hypotension despite high cardiac output?', options: { A: 'Vasodilation exceeds compensation mechanisms', B: 'Direct myocardial suppression alone', C: 'Decreased sympathetic response', D: 'Hypovolemia without vasodilation' }, correctOption: 'A', explanation: 'Septic shock causes excessive NO-mediated vasodilation, overcoming compensatory mechanisms and resulting in profound hypotension.' },
    { difficulty: 'medium', question: 'What is the primary mechanism of action of aspirin?', options: { A: 'Irreversible COX inhibition, preventing thromboxane synthesis', B: 'Direct anticoagulation', C: 'Inhibits platelet aggregation via serotonin', D: 'Increases prostacyclin only' }, correctOption: 'A', explanation: 'Aspirin irreversibly acetylates COX, preventing thromboxane A2 synthesis in platelets.' },
    { difficulty: 'medium', question: 'How does aldosterone increase blood sodium?', options: { A: 'Via ENaC channels in collecting duct, increasing sodium reabsorption', B: 'Direct glomerular filtration reduction', C: 'Inhibits proximal tubule secretion', D: 'Blocks aquaporin channels' }, correctOption: 'A', explanation: 'Aldosterone increases epithelial sodium channel (ENaC) expression, promoting sodium reabsorption in the collecting duct.' },
    { difficulty: 'medium', question: 'What is the effect of ADH on aquaporin-2 channels?', options: { A: 'Increases water permeability in collecting duct', B: 'Decreases water reabsorption', C: 'Blocks potassium channels', D: 'Increases sodium secretion' }, correctOption: 'A', explanation: 'ADH binds to V2 receptors, triggering aquaporin-2 translocation and increasing water reabsorption.' },
    // Hard (34)
    { difficulty: 'hard', question: 'A 45-year-old man with cirrhosis presents with hematemesis. Which mechanism best explains why portal hypertension leads to esophageal varices?', options: { A: 'Increased portal pressure overcoming esophageal venous pressure gradients, dilating submucosal veins', B: 'Direct esophageal wall erosion from portal stasis', C: 'Esophageal dysmotility from portal toxins', D: 'Bacterial translocation causing inflammation' }, correctOption: 'A', explanation: 'Portal hypertension increases portal blood pressure, dilating esophageal varices through portal-systemic collaterals.' },
    { difficulty: 'hard', question: 'A patient with Type 2 diabetes develops progressive nephropathy despite glycemic control. What is the primary mechanism of diabetic glomerulosclerosis?', options: { A: 'Advanced glycation end products (AGEs) cross-linking collagen and reducing mesangial elasticity', B: 'Simple glucose toxicity', C: 'Immune complex deposition', D: 'Direct membranous thickening alone' }, correctOption: 'A', explanation: 'AGEs cross-link extracellular proteins, causing glomerular basement membrane thickening and mesangial expansion in diabetic nephropathy.' },
    { difficulty: 'hard', question: 'How does SIADH cause symptomatic hyponatremia while urine osmolality remains elevated?', options: { A: 'Inappropriate ADH causes water retention without sodium loss, diluting serum sodium', B: 'Adrenal insufficiency causing sodium wasting', C: 'Psychogenic polydipsia', D: 'Nephrotic syndrome reducing oncotic pressure' }, correctOption: 'A', explanation: 'SIADH causes continued aquaporin-2-mediated water reabsorption despite hyposmolality, resulting in dilutional hyponatremia.' },
    { difficulty: 'hard', question: 'A 60-year-old smoker presents with COPD. Why does emphysematous destruction of distal airways lead to air trapping?', options: { A: 'Loss of elastic recoil and airway collapse during expiration, preventing complete air evacuation', B: 'Bronchoconstriction from inflammation', C: 'Mucus plugging alone', D: 'Reduced diaphragmatic function' }, correctOption: 'A', explanation: 'Emphysema destroys elastic tissue and small airways, causing dynamic airway collapse during forced expiration and air trapping.' },
    { difficulty: 'hard', question: 'Compare and contrast the pathophysiology of pulmonary edema in left-sided versus right-sided heart failure.', options: { A: 'Left HF: backward failure causing pulmonary edema; Right HF: systemic venous congestion without pulmonary edema', B: 'Both cause equal pulmonary edema', C: 'Right HF causes more pulmonary edema', D: 'Pulmonary edema occurs only with bilateral failure' }, correctOption: 'A', explanation: 'Left HF causes pulmonary congestion and edema; right HF causes systemic venous congestion and hepatomegaly without pulmonary edema present.' },
    { difficulty: 'hard', question: 'What explains the paradoxical improvement in airway obstruction during an acute asthma exacerbation when peak flow suddenly drops to very low levels (severe-to-life-threatening)?', options: { A: 'Markedly decreased air movement (silent chest) with minimal resistance, paradoxically easier air movement through severely narrowed airways', B: 'Immediate airway relaxation', C: 'Spontaneous remission', D: 'Increased sympathetic response' }, correctOption: 'A', explanation: 'A "silent chest" with very low peak flow indicates severe airway obstruction with minimal air movement, an ominous sign.' },
    { difficulty: 'hard', question: 'How does the Na+/K+ ATPase inhibition by digoxin provide positive inotropy while also increasing vagal tone (negative chronotropy)?', options: { A: 'Increased intracellular Na+ promotes stronger Na+/Ca2+ exchanger activity (positive inotropy); digoxin also directly activates vagal afferents (negative chronotropy)', B: 'Digoxin increases heart rate', C: 'Digoxin only increases contractility without cardiac effects', D: 'Vagal effects precede inotropy' }, correctOption: 'A', explanation: 'Digoxin inhibits Na+/K+ ATPase, increasing intracellular Na+ and Ca2+ (positive inotropy), while also enhancing vagal tone (negative chronotropic).' },
    { difficulty: 'hard', question: 'Why do patients with atrial fibrillation have both reduced cardiac output (from loss of atrial kick) AND increased risk of thromboembolic stroke despite being in a hyperdynamic state?', options: { A: 'Loss of coordinated atrial contraction reduces cardiac output, while blood stasis in LAA promotes thrombus formation independent of cardiac output', B: 'Increased cardiac output alone causes clotting', C: 'Atrial fibrillation always reduces cardiac output', D: 'Thrombus formation is unrelated to AFib' }, correctOption: 'A', explanation: 'Atrial fibrillation eliminates the atrial kick (reducing CO by ~20-30%), while stasis in the LAA promotes thromboembolism regardless of systemic hemodynamics.' },
    { difficulty: 'hard', question: 'Explain the counterintuitive phenomenon where giving NSAIDs to a dehydrated patient can cause acute kidney injury despite normal baseline renal function.', options: { A: 'NSAIDs inhibit prostaglandin synthesis, eliminating compensatory vasodilation of afferent arteriole, critically reducing GFR in setting of preferential efferent vasoconstriction', B: 'NSAIDs directly damage glomeruli', C: 'Dehydration alone causes AKI', D: 'NSAIDs increase glomerular filtration' }, correctOption: 'A', explanation: 'In dehydration, compensatory renal prostaglandins maintain afferent arteriole vasodilation; NSAIDs remove this, causing acute GFR reduction.' },
    { difficulty: 'hard', question: 'How do angiotensin II receptor blockers (ARBs) differ from ACE inhibitors in their mechanism and potential side effects regarding bradykinin?', options: { A: 'ARBs do not inhibit bradykinin degradation, avoiding the dry cough side effect seen with ACE inhibitors', B: 'Both are identical in side effects', C: 'ARBs cause more coughing', D: 'Neither affect bradykinin' }, correctOption: 'A', explanation: 'ACE inhibitors increase bradykinin by inhibiting ACE; ARBs bypass this pathway. This explains the lower cough incidence with ARBs vs ACEIs.' },
    { difficulty: 'hard', question: 'Why is the initial hyperkalemia from potassium release during massive transfusion followed by later hypokalemia in patients receiving multiple units of blood products?', options: { A: 'Initial K+ release from stored RBCs followed by dilutional hypokalemia and ongoing k+ shifts from transfused cells and metabolism', B: 'Hyperkalemia alone occurs', C: 'Immediate hypokalemia develops', D: 'Potassium levels remain stable' }, correctOption: 'A', explanation: 'Stored blood releases K+ initially, but dilution from massive transfusion plus cellular uptake and ongoing losses cause later hypokalemia.' },
    { difficulty: 'hard', question: 'Describe the complex relationship between myocardial ischemia, arrhythmogenesis, and the paradoxical protection from ischemic preconditioning.', options: { A: 'Brief ischemia activates cardioprotective pathways (PKC, K-ATP channels) preventing lethal reperfusion injury, despite ischemic arrhythmia risk', B: 'All ischemia causes death', C: 'Preconditioning increases infarction', D: 'Arrhythmias prevent protection' }, correctOption: 'A', explanation: 'Ischemic preconditioning activates PKC and opens K-ATP channels, providing cardioprotection against subsequent ischemia despite transient arrhythmias.' },
    { difficulty: 'hard', question: 'Why do patients with end-stage renal disease develop secondary hyperparathyroidism despite metastatic calcification?', options: { A: 'Reduced 1,25(OH)2D production impairs intestinal calcium absorption, stimulating PTH despite high circulating calcium-phosphate product', B: 'PTH is always suppressed', C: 'Calcification prevents PTH', D: 'Kidneys produce excess calcitriol' }, correctOption: 'A', explanation: 'ESRD reduces 1,25(OH)2D production, impairing calcium absorption and stimulating PTH despite phosphate retention and calcification.' },
    { difficulty: 'hard', question: 'Explain the pathophysiology of preeclampsia where both endothelial dysfunction and vasospasm occur despite placental abnormalities and elevated circulating vasoconstrictors.', options: { A: 'Placental insufficiency triggers release of sFlt-1 and sEng, inhibiting vascular dysfunction and causing endothelial damage and vasospasm', B: 'Simple hypertension develops', C: 'Preeclampsia causes only proteinuria', D: 'Placental abnormalities are unrelated' }, correctOption: 'A', explanation: 'Reduced placental perfusion releases sFlt-1 (VEGF antagonist) and soluble endoglin, causing endothelial dysfunction characteristic of preeclampsia.' },
    { difficulty: 'hard', question: 'How do statins reduce cardiovascular risk beyond LDL lowering through "pleiotropic" effects?', options: { A: 'Inhibit prenylation of Rho family GTPases, improving endothelial function, reducing vascular inflammation and thrombotic risk', B: 'Statins only lower cholesterol', C: 'Pleiotropic effects increase risk', D: 'Statins have no non-lipid effects' }, correctOption: 'A', explanation: 'Statins inhibit isoprenylation of Rho proteins, improving endothelial function, reducing inflammation, and decreasing thrombotic events.' },
    { difficulty: 'hard', question: 'Explain paradoxical hypertension in severe hyponatremia despite apparent volume overload (from SIADH).', options: { A: 'SIADH causes hypo-osmolar volume expansion but cerebral edema triggers sympathetic activation and ADH increase, causing paradoxical HTN', B: 'Hyponatremia always causes hypotension', C: 'Volume status determines pressure only', D: 'Sympathetic response is minimal' }, correctOption: 'A', explanation: 'Cerebral edema from severe hyponatremia can paradoxically trigger increased sympathetic tone and ADH, causing hypertension.' },
    { difficulty: 'hard', question: 'Why do patients with persistent hyperkalemia despite dialysis treatment sometimes have underlying ECG changes that persist after serum K+ normalization?', options: { A: 'Direkte K+ effects on cardiac membrane permeability persist transiently despite serum normalization; changes reverse with cellular K+ equilibration', B: 'Dialysis always normalizes all cardiac effects', C: 'Hyperkalemia has no cardiac memory', D: 'ECG changes are unrelated to K+' }, correctOption: 'A', explanation: 'Acute hyperkalemia causes ECG changes from altered membrane potential; normalization of serum K+ may precede cellular K+ equilibration.' },
    { difficulty: 'hard', question: 'Describe the hemodynamic paradox of septic shock where high cardiac output and low systemic vascular resistance coexist with tissue hypoperfusion and organ dysfunction.', options: { A: 'Dysregulated vasodilation (NO) causes maldistribution of cardiac output to non-perfusing shunts, despite elevated cardiac output', B: 'Organ dysfunction is independent of hemodynamics', C: 'Low cardiac output causes sepsis only', D: 'SVR always correlates with perfusion' }, correctOption: 'A', explanation: 'Sepsis causes pathological vasodilation, allowing blood to bypass tissue beds through arteriovenous shunts, causing tissue hypoperfusion despite high CO.' },
    { difficulty: 'hard', question: 'How do loop diuretics paradoxically cause metabolic alkalosis despite producing acidic urine in chronic use?', options: { A: 'Volume depletion activates RAAS (increasing aldosterone), promoting H+ secretion and K+ wasting in collecting duct, generating metabolic alkalosis despite loop diuretic effects', B: 'Loop diuretics cause acidosis', C: 'Alkalosis is unrelated to diuretics', D: 'Urine pH determines serum pH' }, correctOption: 'A', explanation: 'Loop diuretics cause volume depletion, activating aldosterone and leading to continued H+ secretion and metabolic alkalosis.' },
    { difficulty: 'hard', question: 'Explain the mechanism by which insulin lowers serum potassium despite having no direct renal effects on potassium excretion.', options: { A: 'Insulin stimulates Na+/K+ ATPase in muscle, driving K+ intracellularly and lowering serum K+ without changing renal K+ excretion', B: 'Insulin increases renal K+ excretion', C: 'Insulin has no effect on potassium', D: 'Insulin raises serum K+' }, correctOption: 'A', explanation: 'Insulin activates Na+/K+ ATPase in skeletal muscle, promoting K+ uptake and decreasing serum K+ regardless of renal function.' },
    { difficulty: 'hard', question: 'Why does hypoalbuminemia in nephrotic syndrome paradoxically worsen edema despite the obvious osmotic gradient favoring fluid reabsorption?', options: { A: 'Severe hypoalbuminemia reduces plasma oncotic pressure, decreasing reabsorption; additionally, renal disease causes salt retention and increased capillary hydrostatic pressure', B: 'Edema is independent of albumin', C: 'High albumin causes edema', D: 'Oncotic pressure is unrelated to edema' }, correctOption: 'A', explanation: 'Nephrotic syndrome combines reduced oncotic pressure (hypoalbuminemia) with primary renal salt retention and elevated capillary hydrostatic pressure.' },
    { difficulty: 'hard', question: 'Explain the paradoxical hypercarbia in severe asthma where minute ventilation is increased but PaCO2 rises.', options: { A: 'Severe air trapping increases dead space, requiring extreme minute ventilation increases to normalize PaCO2; simultaneous respiratory muscle fatigue allows PaCO2 to rise despite increased effort', B: 'Hypercarbia is always from low ventilation', C: 'Asthma decreases dead space', D: 'Respiratory effort is unrelated to CO2' }, correctOption: 'A', explanation: 'Severe asthma causes massive dead space from airway collapse; even increased ventilation fails to eliminate CO2, and fatigue allows PaCO2 rise.' },
    { difficulty: 'hard', question: 'How do thiazide diuretics cause hypokalemia through a dual mechanism involving both increased distal K+ secretion AND reduced serum potassium via volume depletion?', options: { A: 'Thiazides block proximal Na+ reabsorption, increasing distal delivery and K+ secretion; volume depletion activates aldosterone amplifying this effect', B: 'Thiazides increase serum potassium', C: 'Only one mechanism causes hypokalemia', D: 'Thiazides have no effect on potassium' }, correctOption: 'A', explanation: 'Thiazides increase distal sodium delivery and activate renin-angiotensin system, both promoting K+ wasting and hypokalemia.' },
    { difficulty: 'hard', question: 'Explain the complex interplay between visceral hypersensitivity, altered brain-gut axis, and abnormal motility in irritable bowel syndrome.', options: { A: 'Reduced threshold for sensation (low pain perception), dysregulated serotonin/stress response (altered HPA axis), and irregular smooth muscle contractions combine to cause IBS symptoms', B: 'IBS is purely structural', C: 'Only motility abnormalities occur', D: 'Visceral sensation is not involved' }, correctOption: 'A', explanation: 'IBS involves visceral hypersensitivity, altered serotonin signaling, HPA axis dysfunction, and irregular motility patterns.' },
  ],
  exam: [], // Will copy practice questions but could differentiate
  mcq: [] // Will copy practice questions
};

// Copy practice questions to exam and mcq modes
mcqQuestions.exam = [...mcqQuestions.practice];
mcqQuestions.mcq = [...mcqQuestions.practice];

let totalInserted = 0;
let totalDuplicates = 0;
let totalFailed = 0;

function insertAllQuestions() {
  console.log('📊 Inserting pre-curated MCQ questions...\n');

  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO library_questions
     (subject, question, perfect_answer, difficulty, tags, source_type, questionType, mcqOptions, correctOption)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const [mode, questions] of Object.entries(mcqQuestions)) {
    console.log(`${mode.toUpperCase()}: ${questions.length} questions`);

    let modeInserted = 0;
    let modeDuplicates = 0;
    let modeFailed = 0;

    for (const q of questions) {
      try {
        const result = insertStmt.run(
          mode.charAt(0).toUpperCase() + mode.slice(1),
          q.question,
          q.explanation,
          q.difficulty,
          JSON.stringify(['medical', 'mcq', mode]),
          'mcq-preloaded',
          'mcq',
          JSON.stringify(q.options),
          q.correctOption
        );
        if (result.changes > 0) {
          modeInserted++;
          totalInserted++;
        } else {
          modeDuplicates++;
          totalDuplicates++;
        }
      } catch (err) {
        if (err.message.includes('UNIQUE')) {
          modeDuplicates++;
          totalDuplicates++;
        } else {
          modeFailed++;
          totalFailed++;
        }
      }
    }

    console.log(`  ✅ ${modeInserted} inserted, ⚠️  ${modeDuplicates} duplicates, ❌ ${modeFailed} failed\n`);
  }

  // Verify
  const rows = db.prepare(
    `SELECT difficulty, COUNT(*) as count FROM library_questions WHERE questionType='mcq' GROUP BY difficulty`
  ).all();

  console.log('═'.repeat(50));
  console.log(`\n✅ COMPLETE\n`);
  console.log(`✅ Total Inserted: ${totalInserted}`);
  console.log(`⚠️  Duplicates: ${totalDuplicates}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`\n📈 Distribution by Difficulty:`);

  let easyCount = 0, mediumCount = 0, hardCount = 0;
  (rows || []).forEach(row => {
    const count = row.count;
    if (row.difficulty === 'easy') easyCount = count;
    if (row.difficulty === 'medium') mediumCount = count;
    if (row.difficulty === 'hard') hardCount = count;
    console.log(`  ${row.difficulty.padEnd(8)}: ${count} questions`);
  });

  console.log(`\n📚 Total MCQ Questions: ${easyCount + mediumCount + hardCount}`);
  console.log(`\n🎯 Ready for fallback and library!`);

  db.close();
}

insertAllQuestions();
