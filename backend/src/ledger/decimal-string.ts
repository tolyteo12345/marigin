import { registerDecorator, ValidationOptions } from 'class-validator';

// Every quantity/price/USDT value in this feature travels as a string end to
// end (request DTO -> Prisma Decimal -> response) — never `number`/`float`,
// per AGENTS.md "Decimal/fixed-point... không float cho money/quantity/rates".
// Only accepts plain non-negative decimals (no sign, no exponent, no commas)
// so `new Prisma.Decimal(value)` in the service never receives something it
// has to guess the intent of.
const DECIMAL_STRING_PATTERN = /^\d+(\.\d+)?$/;

export function IsDecimalString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDecimalString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && DECIMAL_STRING_PATTERN.test(value);
        },
        defaultMessage(): string {
          return `${propertyName} phải là chuỗi số thập phân không âm (ví dụ "123.45")`;
        },
      },
    });
  };
}
