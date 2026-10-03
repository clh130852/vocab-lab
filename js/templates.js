/* templates.js — 离线文章模板（不联网也能生成文章 + 阅读题）
 *
 * 占位符：
 *   {slot}                换成该槽位选中的词
 *   {art:slot}            自动带 a / an（不可数名词不带）
 *   {distractor:slot}     换成同槽位的另一个词（造选择题干扰项）
 *   {art:distractor:slot} 同上并带冠词
 * 槽位约束：{ pos, tags, deny, allow }，只要给了 allow 就只在 allow 里选词。
 * 每个槽位都做了「语义 + 语法」双重筛选，保证无论从哪个词表选词，句子都读得通。
 */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});

  // 不可数名词：前面不加 a / an
  var UNCOUNTABLE = ('bread rice milk water juice tea soup beef mutton porridge honey yogurt salt food fruit music ' +
    'information advice news weather health work homework progress knowledge money traffic pollution energy nature ' +
    'space research equipment clothing rubbish grass plastic steel cotton silver chemistry physics maths history ' +
    'science literature media labor labour welfare heritage literacy diversity stability atmosphere silence laughter ' +
    'rain snow wind sunshine friendship chicken').split(' ');

  // 以元音字母开头但不读元音：用 a
  var A_NOT_AN = ('university uniform unit unique useful user union universal usual urban one european').split(' ');
  // 以 h 开头但用 an
  var AN_NOT_A = ('hour honest honour honorable').split(' ');

  function articleFor(term) {
    var t = String(term || '').toLowerCase().trim();
    if (!t) return '';
    if (UNCOUNTABLE.indexOf(t) >= 0) return '';
    var first = t.split(/\s+/)[0];
    if (A_NOT_AN.indexOf(first) >= 0) return 'a ';
    if (AN_NOT_A.indexOf(first) >= 0) return 'an ';
    return /^[aeiou]/.test(first) ? 'an ' : 'a ';
  }

  var P = {
    /* —— 校园 —— */
    subject: { allow: ['English', 'Chinese', 'maths', 'history', 'science', 'music', 'art', 'physics', 'chemistry'], note: '学科' },
    studyAdj: { allow: ['interesting', 'difficult', 'easy', 'important', 'useful', 'practical', 'creative', 'simple', 'special', 'popular'], note: '形容学科' },
    teacherAdj: { allow: ['friendly', 'patient', 'helpful', 'strict', 'humorous', 'serious', 'polite', 'careful', 'creative', 'clever', 'smart', 'honest', 'outgoing'], note: '形容老师' },
    schoolLife: { allow: ['interesting', 'busy', 'simple', 'easy', 'wonderful'], note: '形容校园生活' },
    playgroundVerb: { allow: ['run', 'play', 'dance', 'sing', 'exercise', 'walk', 'talk'], note: '操场上的活动' },
    libraryVerb: { allow: ['read', 'write', 'study', 'learn', 'review', 'practice', 'discuss'], note: '图书馆里的活动' },
    job: { allow: ['doctor', 'nurse', 'teacher', 'engineer', 'pilot', 'writer', 'singer', 'artist', 'scientist', 'inventor', 'astronaut', 'driver', 'farmer', 'worker', 'guide', 'reporter', 'cook'], note: '职业' },

    /* —— 出行 / 地点 —— */
    destPlace: { allow: ['park', 'zoo', 'library', 'school', 'farm', 'garden', 'forest', 'river', 'lake', 'sea', 'island', 'mountain', 'beach', 'hill', 'field', 'village', 'town', 'city', 'museum', 'supermarket', 'theater', 'college', 'university', 'restaurant', 'hospital', 'station', 'playground'], note: '地点' },
    quietPlace: { allow: ['school', 'library', 'hospital', 'farm', 'village', 'garden', 'classroom', 'museum'], note: '室内地点' },
    weather: { pos: ['adj.'], tags: ['weather'], note: '天气' },
    vehicle: { allow: ['bus', 'bike', 'car', 'train', 'subway', 'plane', 'boat', 'taxi', 'bicycle', 'underground'], note: '交通工具' },
    socialVerb: { allow: ['play', 'run', 'dance', 'sing', 'walk', 'talk', 'exercise', 'share'], note: '和朋友一起做的事' },
    positiveFeeling: { allow: ['happy', 'excited', 'tired', 'proud', 'thankful', 'grateful', 'lucky'], note: '一天结束时的感受' },
    tripFood: { allow: ['apple', 'banana', 'bread', 'rice', 'egg', 'cake', 'hamburger', 'dumpling', 'watermelon', 'chicken', 'fruit', 'vegetable'], note: '食物' },

    /* —— 健康 / 环保 —— */
    breakfast: { allow: ['egg', 'bread', 'apple', 'banana', 'cake', 'rice', 'fruit', 'vegetable', 'hamburger', 'dumpling'], note: '早餐' },
    exerciseVerb: { allow: ['run', 'swim', 'exercise', 'train', 'dance', 'play', 'walk'], note: '运动' },
    timeOfDay: { allow: ['morning', 'afternoon', 'evening', 'weekend', 'holiday'], note: '时间段' },
    plainAdj: { allow: ['difficult', 'easy', 'expensive', 'cheap', 'slow', 'fast', 'simple', 'boring'], note: '通用形容词' },
    notAdj: { allow: ['difficult', 'easy', 'expensive', 'boring', 'hard', 'simple'], note: '“并不……”' },
    hardAdj: { allow: ['difficult', 'hard', 'dangerous', 'awful', 'terrible', 'dirty', 'noisy', 'crowded', 'serious', 'poor'], note: '形容问题' },
    toughAdj: { allow: ['difficult', 'hard', 'dangerous', 'terrible'], note: '形容处境变难' },
    notAlways: { allow: ['easy', 'simple', 'safe', 'cheap', 'convenient'], note: '“并不总是……”' },
    natureThing: { allow: ['nature', 'water', 'energy', 'land', 'electricity'], note: '自然 / 资源' },
    natureIn: { allow: ['forest', 'river', 'lake', 'sea', 'garden', 'field', 'grass', 'water'], note: '自然景物' },
    greenAction: { allow: ['recycle', 'volunteer', 'share', 'help', 'exercise', 'save', 'clean'], note: '环保行动' },
    natureVerb: { allow: ['save', 'protect', 'recycle', 'preserve', 'clean'], note: '保护自然' },

    /* —— 人物 / 情感 —— */
    personClose: { allow: ['friend', 'teacher', 'parent', 'relative', 'classmate', 'cousin', 'mother', 'father', 'brother', 'sister'], note: '亲近的人' },
    personHelp: { allow: ['grandfather', 'grandmother', 'farmer', 'worker', 'nurse', 'doctor', 'teacher', 'relative', 'friend', 'guest'], note: '受帮助的人' },
    helpVerb: { allow: ['clean', 'cook', 'sing', 'dance', 'draw', 'read', 'write', 'play', 'share', 'teach', 'exercise'], note: '帮助他人做的事' },
    gift: { allow: ['gift', 'notebook', 'pen', 'dictionary', 'picture', 'photo', 'calendar', 'lantern', 'coin'], note: '礼物' },
    mood: { allow: ['happy', 'sad', 'tired', 'worried', 'nervous', 'lonely', 'bored', 'excited', 'sorry', 'afraid'], note: '情绪' },
    moodGood: { allow: ['friendly', 'helpful', 'honest', 'brave', 'patient', 'polite', 'careful', 'creative', 'humorous', 'confident'], note: '形容朋友' },
    virtue: { allow: ['courage', 'effort', 'patience', 'trust', 'wisdom', 'kindness', 'responsibility', 'love'], note: '品质名词' },

    /* —— 动物 / 科技 —— */
    animal: { allow: ['panda', 'tiger', 'elephant', 'lion', 'giraffe', 'koala', 'dog', 'cat', 'chicken'], note: '动物' },
    tech: { allow: ['computer', 'phone', 'technology', 'website', 'program', 'screen', 'robot', 'machine', 'invention'], note: '科技名词' },
    getInfo: { allow: ['send', 'transmit', 'find', 'share', 'spread'], note: '获取信息' },
    talkVerb: { allow: ['speak', 'communicate', 'share', 'study', 'talk'], note: '与人交流' },
    appVerb: { allow: ['study', 'learn', 'read', 'practice', 'review', 'write'], note: '用 App 学习' }
  };

  VL.templates = [
    {
      id: 'school-day',
      title: 'A Day at My School',
      titleCn: '我的校园一天',
      topic: '校园生活',
      level: 1,
      slots: { subject: P.subject, adj1: P.studyAdj, adj2: P.teacherAdj, verb1: P.playgroundVerb, verb2: P.libraryVerb, job: P.job, adj3: P.schoolLife },
      body: [
        'My name is Li Hua and I am a student at a middle school. Every day I arrive at school at half past seven.',
        'My favourite subject is {subject}, because it is {adj1} and useful. Our teacher is very {adj2} and always helps us after class.',
        'In the morning we have four lessons. After class, I often {verb1} with my classmates on the playground, and sometimes we {verb2} in the library.',
        'I think school life is {adj3}. In the future, I want to be {art:job} and help more people.'
      ],
      questions: [
        {
          type: 'choice', stem: "What is the writer's favourite subject?",
          options: ['{subject}', '{distractor:subject}', '{distractor:subject}', '{distractor:subject}'], answer: 0,
          explain: '第一段直接说明 My favourite subject is {subject}，所以选 {subject}。'
        },
        {
          type: 'choice', stem: 'What does the writer often do on the playground after class?',
          options: ['{verb1} with classmates', '{distractor:verb1} with classmates', 'Clean the classroom alone', 'Do homework in the office'], answer: 0,
          explain: '第二段写道 I often {verb1} with my classmates on the playground。'
        },
        {
          type: 'choice', stem: 'What does the writer want to be in the future?',
          options: ['{art:job}', '{art:distractor:job}', '{art:distractor:job}', '{art:distractor:job}'], answer: 0,
          explain: '最后一段说 I want to be {art:job}。'
        }
      ]
    },
    {
      id: 'weekend-trip',
      title: 'A Weekend Trip',
      titleCn: '周末的一次出行',
      topic: '旅行与周末',
      level: 1,
      slots: { place: P.destPlace, weather: P.weather, vehicle: P.vehicle, activity: P.socialVerb, food: P.tripFood, feeling: P.positiveFeeling },
      body: [
        'Last weekend, my family visited the {place} near our city. The weather was {weather}, so we set off early in the morning.',
        'We took the {vehicle} to get there. On the way, I listened to music and took a lot of photos.',
        'At noon we sat under a big tree and ate {art:food}. After that, it was time to {activity} together, and we did not want to leave.',
        'I was {feeling} at the end of the day. I hope we can go there again next month.'
      ],
      questions: [
        {
          type: 'choice', stem: 'Where did the writer go last weekend?',
          options: ['the {place}', 'the {distractor:place}', 'the school library', 'the {distractor:place}'], answer: 0,
          explain: '第一句写明 my family visited the {place} near our city。'
        },
        {
          type: 'choice', stem: 'How did they get there?',
          options: ['By {vehicle}.', 'On foot.', 'By plane and then by ship.', 'They did not go out.'], answer: 0,
          explain: '文中说 We took the {vehicle} to get there。'
        },
        {
          type: 'choice', stem: 'How did the writer feel at the end of the day?',
          options: ['{feeling}', 'Tired and angry', 'Worried about homework', 'Bored and lonely'], answer: 0,
          explain: '最后一句写道 I was {feeling} at the end of the day。'
        }
      ]
    },
    {
      id: 'environment',
      title: 'Let Us Protect Our Home',
      titleCn: '让我们保护家园',
      topic: '环境保护',
      level: 2,
      slots: { natureThing: P.natureThing, action: P.greenAction, adj1: P.hardAdj, place: P.destPlace, virtue: P.virtue },
      body: [
        'The earth is our only home, and it is in danger now. The air and the water are not as clean as before, and this is {art:adj1} problem.',
        'There are many simple things we can do. First, we can use less plastic and {action} whenever we can. Second, we should save {natureThing} and never waste it.',
        'When we go to the {place}, we can pick up rubbish and put it into a bag. These small actions show our {virtue} for nature.',
        'If everyone takes part, the world will become cleaner and greener. Let us start today.'
      ],
      questions: [
        {
          type: 'choice', stem: 'What problem does the passage mainly talk about?',
          options: ['The environment is in danger.', 'Students have too much homework.', 'The city is too crowded.', 'People eat too much meat.'], answer: 0,
          explain: '第一段说 The earth is our only home, and it is in danger now，全文都在讲环保。'
        },
        {
          type: 'choice', stem: 'According to the passage, what should we do?',
          options: ['Use less plastic and {action} whenever we can.', 'Throw rubbish into the river.', 'Use more plastic bags.', 'Stay at home all day.'], answer: 0,
          explain: '第二段写道 we can use less plastic and {action} whenever we can。'
        },
        {
          type: 'choice', stem: 'What is the writer\u2019s purpose in writing this passage?',
          options: ['To ask readers to protect the environment', 'To sell a new product', 'To tell a funny story', 'To introduce a city'], answer: 0,
          explain: '最后一句号召 Let us start today，目的是呼吁大家保护环境。'
        }
      ]
    },
    {
      id: 'healthy-life',
      title: 'How to Live a Healthy Life',
      titleCn: '如何健康生活',
      topic: '健康生活',
      level: 2,
      slots: { food: P.breakfast, exercise: P.exerciseVerb, feeling: P.positiveFeeling, time: P.timeOfDay, adj1: P.notAdj },
      body: [
        'Everyone wants to be healthy, but not everyone knows how. Here are some ideas from my own life.',
        'First, I eat {art:food} for breakfast and drink enough water every day. Good habits are more useful than medicine.',
        'Second, I {exercise} for about thirty minutes in the {time}. Exercise makes my body strong and my mind clear.',
        'Third, I try to sleep early and stay away from my phone at night. After a good rest, I always feel {feeling} and ready to work.',
        'A healthy life is not {adj1} at all. If you start with one small habit today, you will see the change soon.'
      ],
      questions: [
        {
          type: 'choice', stem: 'What does the writer eat for breakfast?',
          options: ['{art:food}', 'Nothing at all', 'Only ice cream', 'Fast food'], answer: 0,
          explain: '第二段开头说 I eat {art:food} for breakfast。'
        },
        {
          type: 'choice', stem: 'How long does the writer exercise every day?',
          options: ['About thirty minutes', 'About three hours', 'About five minutes', 'About eight hours'], answer: 0,
          explain: '第三段写道 I {exercise} for about thirty minutes in the {time}。'
        },
        {
          type: 'choice', stem: 'What is the main idea of the passage?',
          options: ['Good habits help us live a healthy life', 'Phones are the biggest problem', 'Breakfast is not important', 'Everyone should run a marathon'], answer: 0,
          explain: '全文给出三条健康建议，中心是 good habits。'
        }
      ]
    },
    {
      id: 'volunteer',
      title: 'A Day as a Volunteer',
      titleCn: '做志愿者的一天',
      topic: '志愿服务',
      level: 2,
      slots: { person: P.personHelp, place: P.quietPlace, action: P.helpVerb, gift: P.gift, feeling: P.positiveFeeling, virtue: P.virtue },
      body: [
        'Last month I joined a volunteer group at our school. Our first activity was to visit the {place} in our neighbourhood.',
        'When we arrived, we met the {person} there. We brought some books and {art:gift} as presents, and everyone was glad to see us.',
        'We stayed with them and helped them {action}. At first I was a little nervous, but their smiles made me feel {feeling}.',
        'By the end of the day I understood that helping others needs time and {virtue}. It was tiring, but I would like to do it again.'
      ],
      questions: [
        {
          type: 'choice', stem: 'Where did the writer and the group go first?',
          options: ['the {place}', 'the {distractor:place}', 'a shopping mall', 'the airport'], answer: 0,
          explain: '第一段说 Our first activity was to visit the {place}。'
        },
        {
          type: 'choice', stem: 'What did the writer bring as presents?',
          options: ['Some books and {art:gift}', 'Some money and a phone', 'Nothing at all', 'Only some food'], answer: 0,
          explain: '第二段写道 We brought some books and {art:gift} as presents。'
        },
        {
          type: 'choice', stem: 'How did the writer feel about the experience?',
          options: ['Tired but willing to help again', 'Angry and disappointed', 'Afraid of coming back', 'Bored and sleepy'], answer: 0,
          explain: '最后一段说 It was tiring, but I would like to do it again。'
        }
      ]
    },
    {
      id: 'technology',
      title: 'Technology in Our Life',
      titleCn: '生活中的科技',
      topic: '科技与生活',
      level: 3,
      slots: { tech: P.tech, getInfo: P.getInfo, adj1: P.notAlways, talkVerb: P.talkVerb, activity: P.appVerb },
      body: [
        'Twenty years ago, few people could imagine today\u2019s life. Now a small phone is a powerful {tech} that we use every day.',
        'With the help of technology, we can {getInfo} information in a second and {talkVerb} with people far away. Distance is no longer a problem.',
        'Technology also changes how we learn. Many students now {activity} with an app instead of a paper dictionary, and they can get answers at once.',
        'However, technology is not always {adj1}. Some people spend too much time on games and forget the real world.',
        'In my opinion, the key is to use technology wisely: it should serve us, not control us.'
      ],
      questions: [
        {
          type: 'choice', stem: 'Which of the following is TRUE according to the passage?',
          options: ['With technology we can {getInfo} information in a second.', 'Technology has no influence on learning.', 'Distance becomes a bigger problem now.', 'Nobody uses a phone today.'], answer: 0,
          explain: '第二段写道 we can {getInfo} information in a second。'
        },
        {
          type: 'choice', stem: 'What problem does the writer mention?',
          options: ['Some people spend too much time on games.', 'Students cannot use phones.', 'Information travels too slowly.', 'Nobody wants to learn.'], answer: 0,
          explain: '第四段说 Some people spend too much time on games and forget the real world。'
        },
        {
          type: 'choice', stem: "What is the writer's opinion about technology?",
          options: ['We should use it wisely.', 'We should refuse to use it.', 'It is useless for students.', 'It will replace all teachers.'], answer: 0,
          explain: '最后一段说 the key is to use technology wisely。'
        }
      ]
    },
    {
      id: 'family-friends',
      title: 'The People Around Me',
      titleCn: '我身边的人',
      topic: '家庭与朋友',
      level: 1,
      slots: { adj1: P.moodGood, mood: P.mood, activity: P.socialVerb, virtue: P.virtue },
      body: [
        'Everyone needs someone beside them. For me, the most important person in my life is my best friend, Wang Lin.',
        'Wang Lin is {adj1} and always ready to help. When I feel {mood}, she listens and gives me good advice.',
        'We spend a lot of time together. After school we usually {activity} and talk about our plans.',
        'Friendship needs {virtue}. If we understand each other, our friendship will last a long time.',
        'I am lucky to have such a friend, and I will always be thankful for her.'
      ],
      questions: [
        {
          type: 'choice', stem: 'Who is the most important person in the writer\u2019s life?',
          options: ['The best friend Wang Lin', 'A famous singer', 'A history teacher', 'A stranger on the street'], answer: 0,
          explain: '第一段说 the most important person in my life is my best friend, Wang Lin。'
        },
        {
          type: 'choice', stem: 'What does Wang Lin do when the writer feels bad?',
          options: ['She listens and gives advice.', 'She leaves at once.', 'She plays jokes on the writer.', 'She says nothing for days.'], answer: 0,
          explain: '第二段写道 she listens and gives me good advice。'
        },
        {
          type: 'choice', stem: 'What is the passage mainly about?',
          options: ['Friendship and the value of a good friend', 'How to make a study plan', 'The best way to travel', 'Why school is boring'], answer: 0,
          explain: '全文围绕 friendship 展开。'
        }
      ]
    },
    {
      id: 'animals-nature',
      title: 'Animals in the Wild',
      titleCn: '荒野中的动物',
      topic: '动物与自然',
      level: 2,
      slots: { animal: P.animal, nature: P.natureIn, adj1: P.toughAdj, natureVerb: P.natureVerb },
      body: [
        'Many years ago, the forest was a happy home for many animals, such as the {animal}. They found food and clean water in the {nature}.',
        'Today, however, life is becoming {adj1} for them. People cut down trees and build new roads, so the animals lose their homes.',
        'Scientists say that we should {natureVerb} the forest and stop hunting wild animals. Every living thing has the right to live safely.',
        'We are not the owners of the earth; we share it with animals. Protecting them is protecting ourselves.'
      ],
      questions: [
        {
          type: 'choice', stem: 'Where did many animals live happily many years ago?',
          options: ['In the forest', 'In the city centre', 'In a school building', 'In a shopping mall'], answer: 0,
          explain: '第一段说 the forest was a happy home for many animals, such as the {animal}。'
        },
        {
          type: 'choice', stem: 'Why do the animals lose their homes?',
          options: ['Because people cut down trees and build roads.', 'Because the river is clean.', 'Because they like moving.', 'Because winters are shorter.'], answer: 0,
          explain: '第二段写道 People cut down trees and build new roads, so the animals lose their homes。'
        },
        {
          type: 'choice', stem: 'What does the writer want to tell us?',
          options: ['We should protect animals and nature.', 'Animals are dangerous.', 'Forests are useless.', 'We should keep animals at home.'], answer: 0,
          explain: '最后一段说 Protecting them is protecting ourselves。'
        }
      ]
    },
    {
      id: 'city-life',
      title: 'Living in a Big City',
      titleCn: '居住在大城市',
      topic: '城市与生活',
      level: 3,
      slots: { activity: P.socialVerb, adj1: P.notAlways, virtue: P.virtue, vehicle: P.vehicle },
      body: [
        'More and more people are moving to big cities, because there are more chances to work and to learn.',
        'Life in a big city is convenient. You can find a park, a cinema and a hospital in almost every area, and you can travel by {vehicle}.',
        'However, city life is not always {adj1}. The traffic is heavy in the morning, and the air is not as clean as in the countryside.',
        'In my free time, I usually {activity} with my friends. We believe that a good city needs the {virtue} of everyone who lives in it.',
        'A city becomes a better place when people care about each other.'
      ],
      questions: [
        {
          type: 'choice', stem: 'Why do more people move to big cities?',
          options: ['Because there are more chances to work and to learn.', 'Because the air is cleaner there.', 'Because the traffic is light.', 'Because houses there are cheap.'], answer: 0,
          explain: '第一段说 there are more chances to work and to learn。'
        },
        {
          type: 'choice', stem: 'What problem of city life does the writer mention?',
          options: ['Heavy traffic and less clean air', 'Too few hospitals', 'No cinemas', 'No schools'], answer: 0,
          explain: '第三段写道 The traffic is heavy in the morning, and the air is not as clean as in the countryside。'
        },
        {
          type: 'choice', stem: 'What makes a city a better place?',
          options: ['People caring about each other', 'More cars on the road', 'Taller buildings', 'More shopping malls'], answer: 0,
          explain: '最后一句说 A city becomes a better place when people care about each other。'
        }
      ]
    }
  ];

  VL.templates.UNCOUNTABLE = UNCOUNTABLE;
  VL.templates.articleFor = articleFor;
})();
