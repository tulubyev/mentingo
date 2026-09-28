import { SupportedLanguages } from "@repo/shared";
import { EmailContent } from "types";

export const getCoursePaymentSucceededEmailTranslations = (
  language: SupportedLanguages,
  courseName: string,
  formattedAmount: string,
) => {
  const emailContent: Record<SupportedLanguages, EmailContent> = {
    en: {
      heading: "Payment received",
      paragraphs: [
        `Thank you! We have received your payment of ${formattedAmount} for ${courseName}.`,
        "You are now enrolled in the course and can start learning right away.",
      ],
      buttonText: "GO TO COURSE",
    },
    pl: {
      heading: "Płatność otrzymana",
      paragraphs: [
        `Dziękujemy! Otrzymaliśmy płatność ${formattedAmount} za kurs ${courseName}.`,
        "Zostałeś(-aś) zapisany(-a) na kurs i możesz od razu zacząć naukę.",
      ],
      buttonText: "PRZEJDŹ DO KURSU",
    },
    de: {
      heading: "Zahlung erhalten",
      paragraphs: [
        `Vielen Dank! Wir haben deine Zahlung von ${formattedAmount} für ${courseName} erhalten.`,
        "Du bist jetzt für den Kurs eingeschrieben und kannst sofort loslegen.",
      ],
      buttonText: "ZUM KURS",
    },
    lt: {
      heading: "Mokėjimas gautas",
      paragraphs: [
        `Ačiū! Gavome tavo ${formattedAmount} mokėjimą už kursą ${courseName}.`,
        "Dabar esi įtrauktas(-a) į kursą ir gali iškart pradėti mokytis.",
      ],
      buttonText: "Į KURSĄ",
    },
    cs: {
      heading: "Platba přijata",
      paragraphs: [
        `Děkujeme! Přijali jsme tvou platbu ${formattedAmount} za kurz ${courseName}.`,
        "Nyní jsi zapsán(a) do kurzu a můžeš hned začít studovat.",
      ],
      buttonText: "PŘEJÍT NA KURZ",
    },
    es: {
      heading: "Pago recibido",
      paragraphs: [
        `¡Gracias! Hemos recibido tu pago de ${formattedAmount} por ${courseName}.`,
        "Ya estás inscrito en el curso y puedes empezar a aprender ahora mismo.",
      ],
      buttonText: "IR AL CURSO",
    },
    fr: {
      heading: "Paiement reçu",
      paragraphs: [
        `Merci ! Nous avons bien reçu votre paiement de ${formattedAmount} pour ${courseName}.`,
        "Vous êtes maintenant inscrit(e) au cours et pouvez commencer tout de suite.",
      ],
      buttonText: "ACCÉDER AU COURS",
    },
    ru: {
      heading: "Оплата получена",
      paragraphs: [
        `Спасибо! Мы получили вашу оплату ${formattedAmount} за курс «${courseName}».`,
        "Вы записаны на курс и можете начать обучение прямо сейчас.",
      ],
      buttonText: "ПЕРЕЙТИ К КУРСУ",
    },
  };

  return emailContent[language] ?? emailContent.en;
};
