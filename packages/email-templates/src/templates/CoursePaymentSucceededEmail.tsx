import { getCoursePaymentSucceededEmailTranslations } from "translations/coursePaymentSucceeded";

import BaseEmailTemplate from "./BaseEmailTemplate";

import { DefaultEmailSettings } from "types";

export type CoursePaymentSucceededEmailProps = {
  courseName: string;
  courseLink: string;
  formattedAmount: string;
} & DefaultEmailSettings;

export const CoursePaymentSucceededEmail = ({
  courseName,
  courseLink,
  formattedAmount,
  primaryColor,
  companyName,
  language = "ru",
}: CoursePaymentSucceededEmailProps) => {
  const { heading, paragraphs, buttonText } = getCoursePaymentSucceededEmailTranslations(
    language,
    courseName,
    formattedAmount,
  );

  return BaseEmailTemplate({
    heading,
    paragraphs,
    buttonText,
    buttonLink: courseLink,
    primaryColor,
    companyName,
  });
};

export default CoursePaymentSucceededEmail;
