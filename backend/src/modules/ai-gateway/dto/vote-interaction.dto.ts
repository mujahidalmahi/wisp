import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function IsStrictVoteValue(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isStrictVoteValue',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          // Reject anything that is not strictly a number primitive (reject "1", "-1", null, undefined, arrays, objects)
          if (typeof value !== 'number') {
            return false;
          }
          if (!Number.isInteger(value)) {
            return false;
          }
          return [-1, 0, 1].includes(value);
        },
        defaultMessage(_args: ValidationArguments) {
          return 'vote must be an integer strictly equal to -1, 0, or 1';
        },
      },
    });
  };
}

export class VoteInteractionDto {
  @IsStrictVoteValue()
  vote!: number;
}
