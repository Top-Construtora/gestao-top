import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'dateNoTimezone',
  standalone: true
})
export class DateNoTimezonePipe implements PipeTransform {

  transform(value: string | Date | null | undefined, format: string = 'dd/MM/yyyy'): string {
    if (!value) return '-';

    let dateStr: string;

    // Se for Date object, converter para string ISO
    if (value instanceof Date) {
      dateStr = value.toISOString();
    } else {
      dateStr = value;
    }

    // Extrair apenas a parte da data (YYYY-MM-DD) sem considerar timezone
    const dateOnly = dateStr.split('T')[0];
    const [year, month, day] = dateOnly.split('-');

    // Formatar de acordo com o formato solicitado
    if (format === 'dd/MM/yyyy') {
      return `${day}/${month}/${year}`;
    } else if (format === 'MM/yyyy') {
      return `${month}/${year}`;
    } else if (format === 'yyyy-MM-dd') {
      return dateOnly;
    }

    return `${day}/${month}/${year}`;
  }

}
